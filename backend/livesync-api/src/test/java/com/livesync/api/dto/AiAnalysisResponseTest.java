package com.livesync.api.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AiAnalysisResponseTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void testDeserializationWithSnakeCaseGeneratedCode() throws Exception {
        String json = """
            {
                "action": "refactor",
                "language": "python",
                "explanation": "Refactored function",
                "suggestions": ["Use list comprehension"],
                "generated_code": "def foo(): pass"
            }
            """;

        DocumentDtos.AiAnalysisResponse response = objectMapper.readValue(json, DocumentDtos.AiAnalysisResponse.class);

        assertEquals("refactor", response.action());
        assertEquals("python", response.language());
        assertEquals("Refactored function", response.explanation());
        assertEquals(List.of("Use list comprehension"), response.suggestions());
        assertEquals("def foo(): pass", response.generatedCode());
    }

    @Test
    void testDeserializationWithCamelCaseGeneratedCode() throws Exception {
        String json = """
            {
                "action": "explain",
                "language": "javascript",
                "explanation": "JS code explanation",
                "suggestions": [],
                "generatedCode": "console.log('hi')"
            }
            """;

        DocumentDtos.AiAnalysisResponse response = objectMapper.readValue(json, DocumentDtos.AiAnalysisResponse.class);

        assertEquals("explain", response.action());
        assertEquals("javascript", response.language());
        assertEquals("JS code explanation", response.explanation());
        assertTrue(response.suggestions().isEmpty());
        assertEquals("console.log('hi')", response.generatedCode());
    }

    @Test
    void testDeserializationWithUnknownFields() throws Exception {
        String json = """
            {
                "action": "suggest",
                "language": "python",
                "explanation": "Suggestion",
                "suggestions": [],
                "generated_code": null,
                "extra_field": "should be ignored"
            }
            """;

        assertDoesNotThrow(() -> {
            DocumentDtos.AiAnalysisResponse response = objectMapper.readValue(json, DocumentDtos.AiAnalysisResponse.class);
            assertNull(response.generatedCode());
        });
    }
}
