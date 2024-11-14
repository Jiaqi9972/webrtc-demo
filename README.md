# WebRTC Demo

This is a simple demo based on WebRTC.

`webrtc-chat-frontend` is frontend page based on create-react-app

`webrtc-server` is backend server based on spring boot

## How to start

+ clone the repo

+ ```shell
  cd webrtc-chat-frontend
  npm start
  ```

+ ```shell
  cd webrtc-server
  ```

+ run with your IDEA

## Description

+ The backend has 2 socket handlers. One is simple connection and the other is a room. 
  
  + The simple one is stable,  you can use it to make video calls and chat, but it only support 2 users.
  
  + The room one is not stable because of the NAT traversal. If you have powerful TURN server you can try the room one. According to my test,  sometimes user cannot join the room if you use the MultiChatRoom component and the room socket.
  
  + The room socket is also mesh structure. If you want to try SFU, you'll need another server.


