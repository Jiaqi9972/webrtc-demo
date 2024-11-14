package me.findthepeach.webrtcserver.config;

import me.findthepeach.webrtcserver.handler.MultiSocketHandler;
import me.findthepeach.webrtcserver.handler.TwoSocketHandler;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfiguration implements WebSocketConfigurer {

    @Autowired
    private MultiSocketHandler multiSocketHandler;

    @Autowired
    private TwoSocketHandler twoSocketHandler;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {

        // edit here to change the socket connection
        registry.addHandler(multiSocketHandler, "/socket")
                .setAllowedOrigins("*");
    }

}