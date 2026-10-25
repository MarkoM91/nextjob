package com.markom91.nextjob;

import org.junit.Test;
import static org.junit.Assert.*;

public class CvDownloadPolicyTest {
    private final CvDownloadPolicy policy = new CvDownloadPolicy(new WebUrlPolicy("https://example.test"));
    @Test public void permitsOnlyOwnDocumentRoutes() {
        assertTrue(policy.allowsUrl("https://example.test/api/documents/pdf?job=123&version=cv_456"));
        assertTrue(policy.allowsUrl("https://example.test/api/payments/recover?token=private"));
        assertFalse(policy.allowsUrl("https://example.test/api/cv/profile"));
        assertFalse(policy.allowsUrl("https://example.test/api/documents/%70df"));
    }
    @Test public void rejectsExternalAndInsecureRedirects() {
        assertFalse(policy.allowsUrl("https://evil.test/api/documents/pdf"));
        assertFalse(policy.allowsUrl("http://example.test/api/documents/pdf"));
        assertFalse(policy.allowsUrl("https://example.test@evil.test/api/documents/pdf"));
        assertFalse(policy.allowsUrl("file:///api/documents/pdf"));
    }
    @Test public void rejectsLoginAndErrorBodies() {
        assertEquals("", CvDownloadPolicy.allowedMime("text/html; charset=utf-8"));
        assertEquals("", CvDownloadPolicy.allowedMime("application/json"));
        assertEquals("", CvDownloadPolicy.allowedMime("application/octet-stream"));
        assertEquals("", CvDownloadPolicy.allowedMime(null));
    }
    @Test public void acceptsDocumentTypesWithParameters() {
        assertEquals("application/pdf", CvDownloadPolicy.allowedMime("Application/PDF"));
        assertEquals("text/plain", CvDownloadPolicy.allowedMime("text/plain; charset=utf-8"));
        assertEquals("application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                CvDownloadPolicy.allowedMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
    }
    @Test public void boundsTransfersAndAllowsUnknownLengthForStreamingCheck() {
        assertTrue(CvDownloadPolicy.allowsLength(-1));
        assertTrue(CvDownloadPolicy.allowsLength(CvDownloadPolicy.MAX_BYTES));
        assertFalse(CvDownloadPolicy.allowsLength(0));
        assertFalse(CvDownloadPolicy.allowsLength(-2));
        assertFalse(CvDownloadPolicy.allowsLength(CvDownloadPolicy.MAX_BYTES + 1L));
    }
}
