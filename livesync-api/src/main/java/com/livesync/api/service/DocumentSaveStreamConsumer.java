package com.livesync.api.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.stream.*;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.Map;

@Component
public class DocumentSaveStreamConsumer {
    private static final Logger log = LoggerFactory.getLogger(DocumentSaveStreamConsumer.class);
    private static final String STREAM_KEY = "livesync:stream:document-saves";
    private static final String CONSUMER_GROUP = "api-save-group";
    private static final String CONSUMER_NAME = "api-consumer-1";

    private final StringRedisTemplate redisTemplate;
    private final DocumentService documentService;
    private boolean groupCreated = false;

    public DocumentSaveStreamConsumer(StringRedisTemplate redisTemplate, DocumentService documentService) {
        this.redisTemplate = redisTemplate;
        this.documentService = documentService;
    }

    private void ensureConsumerGroup() {
        if (groupCreated) return;
        try {
            redisTemplate.opsForStream().createGroup(STREAM_KEY, CONSUMER_GROUP);
            log.info("Created Redis Stream consumer group '{}' on '{}'", CONSUMER_GROUP, STREAM_KEY);
            groupCreated = true;
        } catch (Exception e) {
            // Group already exists or stream initialized
            groupCreated = true;
        }
    }

    @Scheduled(fixedDelay = 2000)
    public void pollSaveEvents() {
        try {
            ensureConsumerGroup();

            List<MapRecord<String, Object, Object>> records = redisTemplate.opsForStream().read(
                    Consumer.from(CONSUMER_GROUP, CONSUMER_NAME),
                    StreamReadOptions.empty().count(50).block(Duration.ofMillis(500)),
                    StreamOffset.create(STREAM_KEY, ReadOffset.lastConsumed())
            );

            if (records == null || records.isEmpty()) {
                return;
            }

            for (MapRecord<String, Object, Object> record : records) {
                Map<Object, Object> value = record.getValue();
                String documentId = (String) value.get("documentId");
                String content = (String) value.get("content");
                String userId = (String) value.get("userId");

                if (documentId != null && content != null) {
                    boolean updated = documentService.updateContentInternal(documentId, content, userId);
                    if (updated) {
                        log.info("[Redis Stream Consumer] Flushed document {} to PostgreSQL (MessageId: {})", documentId, record.getId());
                    }
                }

                // Acknowledge processed message
                redisTemplate.opsForStream().acknowledge(STREAM_KEY, CONSUMER_GROUP, record.getId());
            }
        } catch (Exception e) {
            log.debug("Redis stream polling notice: {}", e.getMessage());
        }
    }
}
