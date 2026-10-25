package com.markom91.nextjob;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.junit.Test;

public class WebUrlPolicyTest {
    private static final String ORIGIN = "https://role-radar.markom91.chatgpt.site";
    private final WebUrlPolicy policy = new WebUrlPolicy(ORIGIN);

    @Test
    public void ownOriginMatchesHostAndEffectiveHttpsPort() {
        assertTrue(policy.isOwnOrigin(ORIGIN));
        assertTrue(policy.isOwnOrigin(ORIGIN + ":443/workspace?job=123#preview"));
        assertTrue(policy.isOwnOrigin("HTTPS://ROLE-RADAR.MARKOM91.CHATGPT.SITE/matches"));
        assertFalse(policy.isOwnOrigin("http://role-radar.markom91.chatgpt.site/"));
        assertFalse(policy.isOwnOrigin(ORIGIN + ":444/"));
        assertFalse(policy.isOwnOrigin(ORIGIN + "./"));
    }

    @Test
    public void configuredNonDefaultPortDoesNotMatchDefaultPort() {
        WebUrlPolicy customPort = new WebUrlPolicy(ORIGIN + ":8443/");
        assertTrue(customPort.isOwnOrigin(ORIGIN + ":8443/upload"));
        assertFalse(customPort.isOwnOrigin(ORIGIN + "/upload"));
        assertFalse(customPort.isOwnOrigin(ORIGIN + ":443/upload"));
    }

    @Test
    public void lookalikeHostsAndUserInfoAreNotOwnOrigin() {
        assertFalse(policy.isOwnOrigin(ORIGIN + ".evil.example/"));
        assertFalse(policy.isOwnOrigin("https://evil.example/" + ORIGIN));
        assertFalse(policy.isOwnOrigin("https://role-radar.markom91.chatgpt.site@evil.example/"));
        assertFalse(policy.isOwnOrigin("https://evil.example@role-radar.markom91.chatgpt.site/"));
        assertFalse(policy.isOwnOrigin("https://@role-radar.markom91.chatgpt.site/"));
    }

    @Test
    public void malformedOpaqueAndRelativeInputsAreNotOwnOrigin() {
        String[] invalid = {null, "", "/upload", "//role-radar.markom91.chatgpt.site/",
                "https:role-radar.markom91.chatgpt.site", ORIGIN + "/bad path",
                ORIGIN + "/%zz", ORIGIN + ":/", ORIGIN + ":65536/",
                ORIGIN + ":not-a-port/", "https:///role-radar.markom91.chatgpt.site/"};
        for (String url : invalid) {
            assertFalse("Accepted malformed URL: " + url, policy.isOwnOrigin(url));
        }
    }

    @Test
    public void constructorRejectsAnythingBeyondPlainHttpsOrigin() {
        String[] invalid = {null, "", "http://example.com", "https:example.com",
                "https://user@example.com", "https://example.com/app", "https://example.com//",
                "https://example.com?", "https://example.com#", "https://example.com:",
                "https://example.com:65536", "https://example.com:bad"};
        for (String origin : invalid) {
            try {
                new WebUrlPolicy(origin);
                fail("Accepted invalid origin: " + origin);
            } catch (IllegalArgumentException expected) {
                // An origin cannot silently broaden or change the trusted app scope.
            }
        }
        assertTrue(new WebUrlPolicy(ORIGIN + "/").isOwnOrigin(ORIGIN + "/upload"));
    }

    @Test
    public void markerPreservesEncodedPathQueryAndFragmentExactly() {
        String url = ORIGIN + "/workspace/a%2Fb/%252F?job=a%2Bb&name=Jane+Doe&empty=&flag#page%2F2?zoom=90";
        assertEquals(ORIGIN + "/workspace/a%2Fb/%252F?source=android&job=a%2Bb&name=Jane+Doe&empty=&flag#page%2F2?zoom=90",
                policy.launchUrl(url));
    }

    @Test
    public void markerSupportsMissingAndEmptyQueriesWithoutMovingFragment() {
        assertEquals(ORIGIN + "?source=android", policy.launchUrl(ORIGIN));
        assertEquals(ORIGIN + "/upload?source=android#preview", policy.launchUrl(ORIGIN + "/upload#preview"));
        assertEquals(ORIGIN + "/upload?source=android#preview", policy.launchUrl(ORIGIN + "/upload?#preview"));
        assertEquals(ORIGIN + "/upload?source=android#?source=web", policy.launchUrl(ORIGIN + "/upload#?source=web"));
    }

    @Test
    public void existingAndroidMarkerIsIdempotentAndUsesBrowserQueryDecoding() {
        String[] marked = {ORIGIN + "/?source=android", ORIGIN + "/?job=1&source=android#cv",
                ORIGIN + "/?%73ource=%61ndroid&job=a%2Fb", ORIGIN + "/?source=android&source=web"};
        for (String url : marked) {
            assertEquals(url, policy.launchUrl(url));
            assertEquals(url, policy.launchUrl(policy.launchUrl(url)));
        }
    }

    @Test
    public void conflictingFirstSourceCannotOverrideAndroidMarker() {
        String[] queries = {"source=web&job=123", "source=web&source=android", "source&job=1",
                "%73ource=web&source=android", "source=android%20", "Source=android"};
        for (String query : queries) {
            String marked = ORIGIN + "/?source=android&" + query;
            assertEquals(marked, policy.launchUrl(ORIGIN + "/?" + query));
            assertEquals(marked, policy.launchUrl(marked));
        }
    }

    @Test
    public void launchLeavesExternalAndInvalidInputsUnchanged() {
        String[] external = {null, "", "https://employer.example/jobs?id=1#apply",
                "http://role-radar.markom91.chatgpt.site/", "/upload", "javascript:alert(1)",
                "https://evil.example@role-radar.markom91.chatgpt.site/"};
        for (String url : external) {
            assertEquals(url, policy.launchUrl(url));
        }
    }

    @Test
    public void externalPolicyAllowsWebEmailAndTelephoneLinks() {
        String[] allowed = {"https://employer.example/jobs?q=help%20desk#apply", "http://example.com:8080/",
                ORIGIN + "/matches", "HTTPS://EXAMPLE.COM/", "https://[2001:db8::1]:443/",
                "mailto:careers@example.com?subject=Application", "tel:+390212345678"};
        for (String url : allowed) {
            assertTrue("Rejected allowed link: " + url, policy.isExternalLinkAllowed(url));
        }
    }

    @Test
    public void externalPolicyRejectsUnsafeSchemesMissingHostsAndUserInfo() {
        String[] rejected = {null, "", "/relative", "//example.com/jobs", "https:example.com",
                "https:///path", "https://example.com/bad path", "https://example.com/%zz",
                "https://user:pass@example.com/", "http://@example.com/", "https://example.com:",
                "https://example.com:65536/", "mailto:", "tel:", "tel:#fragment",
                "intent://example.com#Intent;scheme=https;end", "file:///etc/passwd",
                "content://com.example/file", "data:text/html,hello", "javascript:alert(1)",
                "ftp://example.com/file"};
        for (String url : rejected) {
            assertFalse("Accepted unsafe link: " + url, policy.isExternalLinkAllowed(url));
        }
    }
}
