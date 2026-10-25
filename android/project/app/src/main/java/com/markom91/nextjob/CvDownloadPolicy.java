package com.markom91.nextjob;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Restricts authenticated native downloads, including every redirect hop. */
public final class CvDownloadPolicy {
    public static final int MAX_BYTES = 12 * 1024 * 1024;
    private final WebUrlPolicy urls;
    public CvDownloadPolicy(WebUrlPolicy urls) { this.urls = urls; }
    public boolean allowsUrl(String url) {
        if (!urls.isOwnOrigin(url)) return false;
        try {
            String path = new URI(url).getRawPath();
            return "/api/documents/pdf".equals(path) || "/api/documents/docx".equals(path)
                    || "/api/documents/txt".equals(path) || "/api/payments/recover".equals(path);
        } catch (URISyntaxException error) { return false; }
    }
    public static String allowedMime(String header) {
        String mime = header == null ? "" : header.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        return "application/pdf".equals(mime)
                || "application/vnd.openxmlformats-officedocument.wordprocessingml.document".equals(mime)
                || "text/plain".equals(mime) ? mime : "";
    }
    public static boolean allowsLength(long bytes) { return bytes == -1 || bytes > 0 && bytes <= MAX_BYTES; }
}
