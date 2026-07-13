package com.hivearmor.util.exceptions;

public class ElasticsearchIndexDocumentUpdateException extends RuntimeException {
    public ElasticsearchIndexDocumentUpdateException(String message) {
        super(message);
    }
}