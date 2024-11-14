package me.findthepeach.webrtcserver.handler;

import org.json.JSONObject;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

@Component
public class MultiSocketHandler extends TextWebSocketHandler {
    private Map<String, Set<WebSocketSession>> rooms = new ConcurrentHashMap<>();
    private Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    @Override
    public void handleTextMessage(WebSocketSession session, TextMessage message) {
        try {
            JSONObject data = new JSONObject(message.getPayload());
            String roomId = data.optString("roomId");
            String type = data.getString("type");

            switch (type) {
                case "join":
                    joinRoom(session, roomId);
                    break;
                case "offer":
                case "answer":
                case "candidate":
                    String to = data.optString("to");
                    if (to != null && !to.isEmpty()) {
                        relayMessageSafely(data, roomId, session, to);
                    }
                    break;
                case "leave":
                    leaveRoom(session, roomId);
                    break;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private synchronized void relayMessageSafely(JSONObject data, String roomId, WebSocketSession sender, String to) {
        try {
            Set<WebSocketSession> roomSessions = rooms.get(roomId);
            if (roomSessions != null) {
                WebSocketSession recipient = sessions.get(to);
                if (recipient != null && recipient.isOpen() && roomSessions.contains(recipient)) {
                    data.put("from", sender.getId());
                    TextMessage textMessage = new TextMessage(data.toString());
                    synchronized (recipient) {
                        recipient.sendMessage(textMessage);
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private synchronized void joinRoom(WebSocketSession session, String roomId) {
        try {
            Set<WebSocketSession> roomSessions = rooms.computeIfAbsent(roomId, k -> new CopyOnWriteArraySet<>());
            roomSessions.add(session);

            JSONObject joinMessage = new JSONObject();
            joinMessage.put("type", "userJoined");
            joinMessage.put("userId", session.getId());

            for (WebSocketSession existingSession : roomSessions) {
                if (!existingSession.getId().equals(session.getId())) {
                    synchronized (existingSession) {
                        existingSession.sendMessage(new TextMessage(joinMessage.toString()));
                    }

                    JSONObject existingUserMessage = new JSONObject();
                    existingUserMessage.put("type", "userJoined");
                    existingUserMessage.put("userId", existingSession.getId());
                    synchronized (session) {
                        session.sendMessage(new TextMessage(existingUserMessage.toString()));
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private synchronized void leaveRoom(WebSocketSession session, String roomId) {
        try {
            Set<WebSocketSession> roomSessions = rooms.get(roomId);
            if (roomSessions != null) {
                roomSessions.remove(session);

                JSONObject leaveMessage = new JSONObject();
                leaveMessage.put("type", "userLeft");
                leaveMessage.put("userId", session.getId());

                for (WebSocketSession roomSession : roomSessions) {
                    if (roomSession.isOpen()) {
                        synchronized (roomSession) {
                            roomSession.sendMessage(new TextMessage(leaveMessage.toString()));
                        }
                    }
                }

                if (roomSessions.isEmpty()) {
                    rooms.remove(roomId);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.put(session.getId(), session);
        try {
            JSONObject message = new JSONObject();
            message.put("type", "clientId");
            message.put("clientId", session.getId());
            synchronized (session) {
                session.sendMessage(new TextMessage(message.toString()));
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String sessionId = session.getId();
        sessions.remove(sessionId);

        for (Map.Entry<String, Set<WebSocketSession>> entry : rooms.entrySet()) {
            try {
                leaveRoom(session, entry.getKey());
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
}