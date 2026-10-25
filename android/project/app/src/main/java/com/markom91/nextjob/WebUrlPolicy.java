package com.markom91.nextjob;

import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;

/** URL decisions shared by WebView navigation and incoming Android deep links. */
public final class WebUrlPolicy {
    private final String host;
    private final int port;

    public WebUrlPolicy(String origin) {
        URI parsed = parseWebUrl(origin);
        if (parsed == null || !"https".equalsIgnoreCase(parsed.getScheme())
                || (parsed.getRawPath() != null && !parsed.getRawPath().isEmpty()
                    && !"/".equals(parsed.getRawPath()))
                || parsed.getRawQuery() != null || parsed.getRawFragment() != null) {
            throw new IllegalArgumentException("Expected a plain HTTPS origin");
        }
        host = parsed.getHost();
        port = effectivePort(parsed);
    }

    public boolean isOwnOrigin(String url) {
        URI parsed = parseWebUrl(url);
        return parsed != null && "https".equalsIgnoreCase(parsed.getScheme())
                && host.equalsIgnoreCase(parsed.getHost()) && port == effectivePort(parsed);
    }

    /** Keep raw URL bytes intact, adding the platform marker before other query values. */
    public String launchUrl(String url) {
        if (!isOwnOrigin(url)) {
            return url;
        }
        URI parsed = parseWebUrl(url);
        String query = parsed.getRawQuery();
        if (hasLeadingAndroidSource(query)) {
            return url;
        }

        int fragmentIndex = url.indexOf('#');
        String fragment = fragmentIndex < 0 ? "" : url.substring(fragmentIndex);
        String beforeFragment = fragmentIndex < 0 ? url : url.substring(0, fragmentIndex);
        if (query == null) {
            return beforeFragment + "?source=android" + fragment;
        }
        int queryIndex = beforeFragment.indexOf('?');
        return beforeFragment.substring(0, queryIndex + 1) + "source=android"
                + (query.isEmpty() ? "" : "&" + query) + fragment;
    }

    public boolean isExternalLinkAllowed(String url) {
        URI parsed = parse(url);
        if (parsed == null || !parsed.isAbsolute()) {
            return false;
        }
        String scheme = parsed.getScheme();
        if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
            return parseWebUrl(url) != null;
        }
        return ("mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme))
                && parsed.getRawSchemeSpecificPart() != null
                && !parsed.getRawSchemeSpecificPart().isEmpty();
    }

    private static URI parseWebUrl(String url) {
        URI parsed = parse(url);
        if (parsed == null || !parsed.isAbsolute() || parsed.isOpaque()
                || !("https".equalsIgnoreCase(parsed.getScheme())
                    || "http".equalsIgnoreCase(parsed.getScheme()))
                || parsed.getHost() == null || parsed.getHost().isEmpty()
                || parsed.getRawUserInfo() != null || parsed.getRawAuthority() == null
                || parsed.getRawAuthority().endsWith(":")
                || parsed.getPort() < -1 || parsed.getPort() > 65535) {
            return null;
        }
        return parsed;
    }

    private static URI parse(String url) {
        if (url == null || url.isEmpty()) {
            return null;
        }
        try {
            return new URI(url);
        } catch (URISyntaxException exception) {
            return null;
        }
    }

    private static int effectivePort(URI parsed) {
        if (parsed.getPort() != -1) {
            return parsed.getPort();
        }
        return "https".equalsIgnoreCase(parsed.getScheme()) ? 443 : 80;
    }

    private static boolean hasLeadingAndroidSource(String query) {
        if (query == null) {
            return false;
        }
        for (String parameter : query.split("&", -1)) {
            int equalsIndex = parameter.indexOf('=');
            String name = equalsIndex < 0 ? parameter : parameter.substring(0, equalsIndex);
            if ("source".equals(decodeQueryComponent(name))) {
                String value = equalsIndex < 0 ? "" : parameter.substring(equalsIndex + 1);
                // Browser URLSearchParams.get returns the first matching value.
                return "android".equals(decodeQueryComponent(value));
            }
        }
        return false;
    }

    private static String decodeQueryComponent(String component) {
        try {
            return URLDecoder.decode(component, "UTF-8");
        } catch (UnsupportedEncodingException exception) {
            throw new IllegalStateException("UTF-8 is unavailable", exception);
        }
    }
}
