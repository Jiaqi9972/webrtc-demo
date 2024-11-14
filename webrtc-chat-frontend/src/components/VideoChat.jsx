import React, { useState, useEffect, useRef } from "react";

const VideoChat = () => {
  const [isConnected, setIsConnected] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const ws = useRef(null);
  const localStream = useRef(null);

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

  return (
    <div className="p-4">
      <h1 className="text-2xl mb-4">WebRTC Video Chat</h1>

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
    </div>
  );
};

export default VideoChat;
