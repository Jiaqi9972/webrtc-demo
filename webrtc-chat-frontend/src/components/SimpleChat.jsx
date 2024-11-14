import React, { useState, useEffect, useRef } from "react";

const SimpleChat = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const ws = useRef(null);
  const peerConnection = useRef(null);
  const dataChannel = useRef(null);

  useEffect(() => {
    // WebSocket connection
    ws.current = new WebSocket("ws://localhost:8080/socket");

    ws.current.onopen = () => {
      console.log("WebSocket Connected");
      initializePeerConnection();
    };

    ws.current.onmessage = (event) => {
      handleSignalingMessage(event.data);
    };

    return () => {
      if (ws.current) ws.current.close();
      if (peerConnection.current) peerConnection.current.close();
    };
  }, []);

  const initializePeerConnection = () => {
    const configuration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };

    peerConnection.current = new RTCPeerConnection(configuration);

    // Set up data channel
    dataChannel.current = peerConnection.current.createDataChannel("chat");
    setupDataChannel(dataChannel.current);

    peerConnection.current.ondatachannel = (event) => {
      dataChannel.current = event.channel;
      setupDataChannel(dataChannel.current);
    };

    // Handle ICE candidates
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalingMessage({
          type: "candidate",
          candidate: event.candidate,
        });
      }
    };

    // Monitor connection state
    peerConnection.current.oniceconnectionstatechange = () => {
      console.log(
        "ICE Connection State:",
        peerConnection.current.iceConnectionState
      );
      setIsConnected(peerConnection.current.iceConnectionState === "connected");
    };
  };

  const setupDataChannel = (channel) => {
    channel.onopen = () => {
      console.log("Data channel opened");
      setIsConnected(true);
    };

    channel.onmessage = (event) => {
      setMessages((prev) => [...prev, { text: event.data, fromMe: false }]);
    };

    channel.onclose = () => {
      console.log("Data channel closed");
      setIsConnected(false);
    };
  };

  const sendSignalingMessage = (message) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  };

  const handleSignalingMessage = async (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case "offer":
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(data.offer)
        );
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        sendSignalingMessage({ type: "answer", answer });
        break;

      case "answer":
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
        break;

      case "candidate":
        if (data.candidate) {
          await peerConnection.current.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        }
        break;
    }
  };

  const startConnection = async () => {
    try {
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      sendSignalingMessage({ type: "offer", offer });
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  };

  const sendMessage = () => {
    if (!inputMessage.trim() || !dataChannel.current) return;

    if (dataChannel.current.readyState === "open") {
      dataChannel.current.send(inputMessage);
      setMessages((prev) => [...prev, { text: inputMessage, fromMe: true }]);
      setInputMessage("");
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl mb-4">WebRTC Chat</h1>

      <button
        onClick={startConnection}
        disabled={isConnected}
        className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
      >
        Start Chat
      </button>

      <div className="border rounded p-4 h-96 overflow-y-auto mb-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`mb-2 ${msg.fromMe ? "text-right" : "text-left"}`}
          >
            <span
              className={`inline-block p-2 rounded ${
                msg.fromMe ? "bg-blue-100" : "bg-gray-100"
              }`}
            >
              {msg.text}
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && sendMessage()}
          disabled={!isConnected}
          className="flex-1 border rounded px-2 py-1"
          placeholder="Type a message..."
        />
        <button
          onClick={sendMessage}
          disabled={!isConnected}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default SimpleChat;
