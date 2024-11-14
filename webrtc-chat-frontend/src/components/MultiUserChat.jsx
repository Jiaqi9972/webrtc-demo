import React, { useState, useEffect, useRef } from "react";

const animalNames = [
  "Panda",
  "Tiger",
  "Lion",
  "Elephant",
  "Giraffe",
  "Penguin",
  "Dolphin",
  "Kangaroo",
  "Koala",
  "Fox",
  "Wolf",
  "Bear",
];

const MultiUserChat = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("room1"); // Default room
  const [peers, setPeers] = useState(new Set());
  const [isConnected, setIsConnected] = useState(false);

  const ws = useRef(null);
  const dataChannels = useRef({});
  const peerConnections = useRef({});
  const messagesEndRef = useRef(null);

  useEffect(() => {
    setUsername(animalNames[Math.floor(Math.random() * animalNames.length)]);
    connectToWebSocket();

    return () => {
      Object.values(dataChannels.current).forEach((channel) => channel.close());
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      if (ws.current) ws.current.close();
    };
  }, []);

  const connectToWebSocket = () => {
    ws.current = new WebSocket("ws://localhost:8080/socket");

    ws.current.onopen = () => {
      console.log("WebSocket Connected");
      joinRoom();
    };

    ws.current.onmessage = handleSignalingMessage;
  };

  const joinRoom = () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: "join",
          roomId: roomId,
        })
      );
    }
  };

  const initializePeerConnection = async (peerId) => {
    const configuration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        {
          url: "turn:192.158.29.39:3478?transport=udp",
          credential: "JZEOEt2V3Qb0y27GRntt2u2PAYA=",
          username: "28224511:1379330808",
        },
      ],
    };

    const pc = new RTCPeerConnection(configuration);
    peerConnections.current[peerId] = pc;

    const dataChannel = pc.createDataChannel("chat");
    setupDataChannel(dataChannel, peerId);

    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel, peerId);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalingMessage({
          type: "candidate",
          candidate: event.candidate,
          to: peerId,
        });
      }
    };

    return pc;
  };

  const setupDataChannel = (channel, peerId) => {
    dataChannels.current[peerId] = channel;

    channel.onopen = () => {
      setIsConnected(true);
      setPeers((prev) => new Set(prev.add(peerId)));
    };

    channel.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages((prev) => [
        ...prev,
        {
          text: data.message,
          sender: data.username,
          fromMe: false,
        },
      ]);
    };

    channel.onclose = () => {
      setPeers((prev) => {
        const newPeers = new Set(prev);
        newPeers.delete(peerId);
        return newPeers;
      });
    };
  };

  const handleSignalingMessage = async (event) => {
    const data = JSON.parse(event.data);
    const { type, from } = data;
    let pc;

    try {
      switch (type) {
        case "clientId":
          setIsConnected(true);
          break;

        case "userJoined":
          if (!peerConnections.current[data.userId]) {
            pc = await initializePeerConnection(data.userId);
            pc.pendingCandidates = [];
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignalingMessage({
              type: "offer",
              offer,
              to: data.userId,
            });
          }
          break;

        case "offer":
          pc = peerConnections.current[from];
          if (!pc) {
            pc = await initializePeerConnection(from);
            pc.pendingCandidates = [];
            peerConnections.current[from] = pc;
          }
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (pc.pendingCandidates?.length > 0) {
            for (const candidate of pc.pendingCandidates) {
              await pc.addIceCandidate(candidate);
            }
            pc.pendingCandidates = [];
          }
          sendSignalingMessage({
            type: "answer",
            answer,
            to: from,
          });
          break;

        case "answer":
          pc = peerConnections.current[from];
          if (pc && pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(
              new RTCSessionDescription(data.answer)
            );
            if (pc.pendingCandidates?.length > 0) {
              for (const candidate of pc.pendingCandidates) {
                await pc.addIceCandidate(candidate);
              }
              pc.pendingCandidates = [];
            }
          }
          break;

        case "candidate":
          pc = peerConnections.current[from];
          if (pc) {
            const candidate = new RTCIceCandidate(data.candidate);
            if (pc.remoteDescription) {
              await pc.addIceCandidate(candidate);
            } else {
              pc.pendingCandidates = pc.pendingCandidates || [];
              pc.pendingCandidates.push(candidate);
            }
          }
          break;

        case "userLeft":
          if (peerConnections.current[data.userId]) {
            peerConnections.current[data.userId].close();
            delete peerConnections.current[data.userId];
            delete dataChannels.current[data.userId];
            setPeers((prev) => {
              const newPeers = new Set(prev);
              newPeers.delete(data.userId);
              return newPeers;
            });
          }
          break;
      }
    } catch (error) {
      console.error("Signaling error:", error, data);
    }
  };

  const sendSignalingMessage = (message) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          ...message,
          roomId: roomId,
        })
      );
    }
  };

  const sendMessage = () => {
    if (!inputMessage.trim()) return;

    const messageData = {
      message: inputMessage,
      username: username,
    };

    Object.values(dataChannels.current).forEach((channel) => {
      if (channel.readyState === "open") {
        channel.send(JSON.stringify(messageData));
      }
    });

    setMessages((prev) => [
      ...prev,
      {
        text: inputMessage,
        sender: username,
        fromMe: true,
      },
    ]);
    setInputMessage("");
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl mb-4">Multi-user Chat Room</h1>
      <div className="mb-4">Your name: {username}</div>
      <div className="mb-4">Connected peers: {Array.from(peers).length}</div>

      <div className="border rounded p-4 h-96 overflow-y-auto mb-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`mb-2 ${msg.fromMe ? "text-right" : "text-left"}`}
          >
            <div className="text-sm text-gray-500">{msg.sender}</div>
            <span
              className={`inline-block p-2 rounded ${
                msg.fromMe ? "bg-blue-100" : "bg-gray-100"
              }`}
            >
              {msg.text}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && sendMessage()}
          className="flex-1 border rounded px-2 py-1"
          placeholder="Type a message..."
        />
        <button
          onClick={sendMessage}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default MultiUserChat;
