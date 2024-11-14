import React, { useState, useEffect, useRef } from "react";

const VideoChatWithText = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const dataChannel = useRef(null);
  const ws = useRef(null);
  const localStream = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    ws.current = new WebSocket("ws://localhost:8080/socket");

    ws.current.onopen = () => {
      console.log("WebSocket Connected");
      initializePeerConnection();
    };

    ws.current.onmessage = (event) => {
      handleSignalingMessage(event.data);
    };

    return () => {
      localStream.current?.getTracks().forEach((track) => track.stop());
      if (ws.current) ws.current.close();
      if (peerConnection.current) peerConnection.current.close();
    };
  }, []);

  const initializePeerConnection = async () => {
    const configuration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
      ],
    };

    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { max: 30 },
        },
        audio: true,
      });

      localVideoRef.current.srcObject = localStream.current;

      peerConnection.current = new RTCPeerConnection(configuration);

      // Set up data channel
      dataChannel.current = peerConnection.current.createDataChannel("chat");
      setupDataChannel(dataChannel.current);

      peerConnection.current.ondatachannel = (event) => {
        dataChannel.current = event.channel;
        setupDataChannel(dataChannel.current);
      };

      localStream.current.getTracks().forEach((track) => {
        peerConnection.current.addTrack(track, localStream.current);
      });

      peerConnection.current.ontrack = (event) => {
        remoteVideoRef.current.srcObject = event.streams[0];
      };

      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignalingMessage({
            type: "candidate",
            candidate: event.candidate,
          });
        }
      };

      peerConnection.current.oniceconnectionstatechange = () => {
        console.log(
          "ICE Connection State:",
          peerConnection.current.iceConnectionState
        );
        setIsConnected(
          peerConnection.current.iceConnectionState === "connected"
        );
      };
    } catch (error) {
      console.error("Error accessing media devices:", error);
    }
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

    try {
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
    } catch (error) {
      console.error("Error handling signaling message:", error);
    }
  };

  const startCall = async () => {
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
      <h1 className="text-2xl mb-4">WebRTC Video & Text Chat</h1>

      <button
        onClick={startCall}
        disabled={isConnected}
        className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
      >
        Start Call
      </button>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h2 className="text-lg mb-2">Local Video</h2>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full border rounded"
          />
        </div>
        <div>
          <h2 className="text-lg mb-2">Remote Video</h2>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full border rounded"
          />
        </div>
      </div>

      <div className="mt-4">
        <h2 className="text-lg mb-2">Chat</h2>
        <div className="border rounded p-4 h-48 overflow-y-auto mb-4">
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
          <div ref={messagesEndRef} />
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
    </div>
  );
};

export default VideoChatWithText;
