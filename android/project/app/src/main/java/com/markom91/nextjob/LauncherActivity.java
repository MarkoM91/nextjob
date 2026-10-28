package com.markom91.nextjob;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Hosts only NextJOB's HTTPS origin. No JavaScript-to-native interface is exposed. */
public final class LauncherActivity extends Activity {
    private static final int OPEN_CV = 1201, SAVE_CV = 1202, MAX_CV_BYTES = CvDownloadPolicy.MAX_BYTES;
    private static final String PDF = "application/pdf";
    private static final String DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private WebUrlPolicy urls;
    private CvDownloadPolicy downloadPolicy;
    private PlayBillingController billing;
    private WebView webView, popup;
    private ProgressBar progress, spinner;
    private LinearLayout status;
    private TextView statusTitle, statusBody;
    private Button retry;
    private ValueCallback<Uri[]> fileCallback;
    private PendingDownload pendingDownload;
    private volatile boolean destroyed;
    private boolean downloading, pageFailed, rendererGone;
    private String failedUrl;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        urls = new WebUrlPolicy(getString(R.string.app_origin));
        downloadPolicy = new CvDownloadPolicy(urls);
        WebView.setWebContentsDebuggingEnabled(false);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(244, 245, 241));
        setContentView(root);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        root.requestApplyInsets();
        webView = new WebView(this);
        configureWebView();
        billing = new PlayBillingController(this, urls, getString(R.string.app_origin), url -> {
            if (!destroyed && webView != null && urls.isOwnOrigin(webView.getUrl())) webView.loadUrl(url);
        }, () -> { if (!destroyed && webView != null && urls.isOwnOrigin(webView.getUrl())) webView.reload(); });
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        root.addView(progress, new FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP));
        createStatus(root);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::navigateBack);
        }
        boolean restored = savedInstanceState != null && webView.restoreState(savedInstanceState) != null
                && urls.isOwnOrigin(webView.getUrl());
        if (!restored) webView.loadUrl(launchUrl(getIntent()));
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); // NextJOB and its PDF.js worker require JavaScript.
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setGeolocationEnabled(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " NextJOBAndroid/" + getString(R.string.app_version));
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setBackgroundColor(Color.rgb(244, 245, 241));
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return !urls.isOwnOrigin(request.getUrl().toString());
                return route(request.getUrl().toString(), request.hasGesture());
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                pageFailed = false;
                if (urls.isOwnOrigin(url)) failedUrl = url;
                progress.setVisibility(View.VISIBLE);
            }
            @Override public void onPageCommitVisible(WebView view, String url) {
                if (!pageFailed) status.setVisibility(View.GONE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
                if (!pageFailed) status.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError(R.string.connection_title, R.string.connection_body);
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) showError(R.string.service_title, R.string.service_body);
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                showError(R.string.secure_connection_title, R.string.secure_connection_body);
            }
            @Override public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                rendererGone = true;
                view.destroy();
                webView = null;
                showError(R.string.service_title, R.string.render_body);
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) { progress.setProgress(value); }
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                cancelFileChooser();
                if (params.getMode() != FileChooserParams.MODE_OPEN || !urls.isOwnOrigin(view.getUrl())) {
                    callback.onReceiveValue(null); return true;
                }
                fileCallback = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*")
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{PDF, DOCX});
                try { startActivityForResult(picker, OPEN_CV); }
                catch (ActivityNotFoundException error) { cancelFileChooser(); toast(R.string.picker_unavailable); }
                return true;
            }
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, Message result) {
                if (!userGesture) return false;
                if (popup != null) popup.destroy();
                popup = new WebView(LauncherActivity.this);
                popup.getSettings().setJavaScriptEnabled(false);
                popup.getSettings().setAllowFileAccess(false);
                popup.getSettings().setAllowContentAccess(false);
                popup.setWebViewClient(new WebViewClient() {
                    private void forward(String url) {
                        if ("about:blank".equals(url)) return;
                        if (urls.isOwnOrigin(url) && webView != null) {
                            if (!route(url, true)) webView.loadUrl(url);
                        } else route(url, true);
                        if (popup != null) { popup.destroy(); popup = null; }
                    }
                    @Override public boolean shouldOverrideUrlLoading(WebView child, WebResourceRequest request) {
                        forward(request.getUrl().toString()); return true;
                    }
                    @Override public void onPageStarted(WebView child, String url, android.graphics.Bitmap icon) { forward(url); }
                });
                ((WebView.WebViewTransport) result.obj).setWebView(popup);
                result.sendToTarget();
                return true;
            }
        });
        webView.setDownloadListener(this::download);
    }

    private boolean route(String url, boolean userGesture) {
        if (urls.isOwnOrigin(url)) {
            if (billing != null && billing.handle(url)) return true;
            String path = Uri.parse(url).getPath();
            if (path != null && path.startsWith("/api/auth/") && path.endsWith("/start")) {
                new AlertDialog.Builder(this).setMessage(R.string.social_login_unavailable)
                        .setPositiveButton(android.R.string.ok, null).show();
                return true;
            }
            return false;
        }
        if (urls.isExternalLinkAllowed(url) && userGesture) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); }
            catch (ActivityNotFoundException error) { toast(R.string.external_unavailable); }
        } else if (!"about:blank".equals(url)) toast(R.string.external_blocked);
        return true;
    }

    private String launchUrl(Intent intent) {
        String requested = intent == null ? null : intent.getDataString();
        return urls.launchUrl(urls.isOwnOrigin(requested) ? requested : getString(R.string.launch_url));
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        if (webView != null) webView.loadUrl(launchUrl(intent));
    }

    private void createStatus(FrameLayout root) {
        status = new LinearLayout(this);
        status.setOrientation(LinearLayout.VERTICAL); status.setGravity(Gravity.CENTER);
        status.setPadding(dp(32), dp(24), dp(32), dp(24));
        status.setBackgroundColor(Color.rgb(244, 245, 241));
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher); logo.setContentDescription(null);
        status.addView(logo, new LinearLayout.LayoutParams(dp(64), dp(64)));
        statusTitle = new TextView(this);
        statusTitle.setText(R.string.app_name); statusTitle.setTextSize(25);
        statusTitle.setTextColor(Color.rgb(18, 59, 52)); statusTitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(-1, -2);
        titleParams.topMargin = dp(20); status.addView(statusTitle, titleParams);
        statusBody = new TextView(this);
        statusBody.setText(R.string.loading); statusBody.setTextColor(Color.rgb(66, 87, 79));
        statusBody.setTextSize(16); statusBody.setGravity(Gravity.CENTER);
        status.addView(statusBody, new LinearLayout.LayoutParams(-1, -2));
        spinner = new ProgressBar(this);
        LinearLayout.LayoutParams spinnerParams = new LinearLayout.LayoutParams(dp(32), dp(32));
        spinnerParams.topMargin = dp(24); status.addView(spinner, spinnerParams);
        retry = new Button(this); retry.setText(R.string.retry); retry.setVisibility(View.GONE);
        retry.setOnClickListener(view -> {
            if (rendererGone) { recreate(); return; }
            statusTitle.setText(R.string.app_name); statusBody.setText(R.string.loading);
            spinner.setVisibility(View.VISIBLE); retry.setVisibility(View.GONE);
            webView.loadUrl(urls.isOwnOrigin(failedUrl) ? failedUrl : getString(R.string.launch_url));
        });
        status.addView(retry);
        root.addView(status, new FrameLayout.LayoutParams(-1, -1));
    }
    private void showError(int title, int body) {
        pageFailed = true; progress.setVisibility(View.GONE);
        statusTitle.setText(title); statusBody.setText(body);
        spinner.setVisibility(View.GONE); retry.setVisibility(View.VISIBLE); status.setVisibility(View.VISIBLE);
        statusTitle.announceForAccessibility(getString(title));
    }

    private void download(String url, String userAgent, String disposition, String mimeType, long length) {
        if (downloading || pendingDownload != null) { toast(R.string.download_busy); return; }
        if (!downloadPolicy.allowsUrl(url)) { toast(R.string.download_unavailable); return; }
        String cookies = CookieManager.getInstance().getCookie(url);
        downloading = true; toast(R.string.preparing_download);
        downloads.execute(() -> {
            try {
                PendingDownload result = fetchDownload(url, cookies, userAgent);
                runOnUiThread(() -> {
                    downloading = false;
                    if (destroyed) return;
                    pendingDownload = result;
                    Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType(result.mime)
                            .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, result.filename);
                    try { startActivityForResult(save, SAVE_CV); }
                    catch (ActivityNotFoundException error) { pendingDownload = null; toast(R.string.picker_unavailable); }
                });
            } catch (Exception error) {
                runOnUiThread(() -> { downloading = false; if (!destroyed) toast(R.string.download_unavailable); });
            }
        });
    }

    private PendingDownload fetchDownload(String initial, String cookies, String userAgent) throws Exception {
        String target = initial;
        for (int hop = 0; hop < 5; hop++) {
            if (!downloadPolicy.allowsUrl(target)) throw new IllegalArgumentException("Unexpected download redirect");
            HttpURLConnection connection = (HttpURLConnection) new URL(target).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000); connection.setReadTimeout(30000); connection.setUseCaches(false);
            if (cookies != null) connection.setRequestProperty("Cookie", cookies);
            if (userAgent != null) connection.setRequestProperty("User-Agent", userAgent);
            try {
                int code = connection.getResponseCode();
                if (code >= 300 && code < 400) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IllegalArgumentException("Missing download location");
                    target = new URL(new URL(target), location).toString(); continue;
                }
                String mime = CvDownloadPolicy.allowedMime(connection.getContentType());
                if (code != 200 || mime.isEmpty() || !CvDownloadPolicy.allowsLength(connection.getContentLengthLong()))
                    throw new IllegalArgumentException("Download unavailable");
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (InputStream input = connection.getInputStream()) {
                    byte[] buffer = new byte[8192]; int read;
                    while ((read = input.read(buffer)) != -1) {
                        if (destroyed || Thread.currentThread().isInterrupted() || bytes.size() + read > MAX_CV_BYTES)
                            throw new IllegalArgumentException("Download interrupted or too large");
                        bytes.write(buffer, 0, read);
                    }
                }
                if (bytes.size() == 0) throw new IllegalArgumentException("Empty download");
                String filename = URLUtil.guessFileName(target, connection.getHeaderField("Content-Disposition"), mime)
                        .replaceAll("[^\\p{L}\\p{N}._ -]", "_");
                if (filename.length() > 100) filename = filename.substring(filename.length() - 100);
                return new PendingDownload(bytes.toByteArray(), mime, filename);
            } finally { connection.disconnect(); }
        }
        throw new IllegalArgumentException("Too many download redirects");
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent result) {
        super.onActivityResult(requestCode, resultCode, result);
        Uri uri = result == null ? null : result.getData();
        if (requestCode == OPEN_CV && fileCallback != null) {
            ValueCallback<Uri[]> callback = fileCallback;
            if (resultCode != RESULT_OK) { cancelFileChooser(); return; }
            downloads.execute(() -> {
                boolean valid = readableCv(uri);
                runOnUiThread(() -> {
                    if (destroyed || fileCallback != callback) return;
                    fileCallback = null;
                    callback.onReceiveValue(valid ? new Uri[]{uri} : null);
                    if (!valid) toast(R.string.invalid_cv);
                });
            });
        } else if (requestCode == SAVE_CV) {
            PendingDownload content = pendingDownload; pendingDownload = null;
            if (resultCode != RESULT_OK || uri == null || content == null || !"content".equals(uri.getScheme())) return;
            downloading = true;
            downloads.execute(() -> {
                boolean saved = false;
                try (OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
                    if (output == null) throw new IllegalArgumentException("Save unavailable");
                    output.write(content.bytes); saved = true;
                } catch (Exception error) { saved = false; /* Never log CV content, cookies or private download URLs. */ }
                boolean complete = saved;
                runOnUiThread(() -> { downloading = false; if (!destroyed) toast(complete ? R.string.download_saved : R.string.save_failed); });
            });
        }
    }
    private boolean readableCv(Uri uri) {
        if (uri == null || !"content".equals(uri.getScheme())) return false;
        try {
            String type = getContentResolver().getType(uri);
            if (type != null && !PDF.equals(type) && !DOCX.equals(type) && !"application/octet-stream".equals(type)) return false;
            boolean pdf;
            try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
                if (cursor == null || !cursor.moveToFirst()) return false;
                String name = cursor.getString(0).toLowerCase(Locale.ROOT);
                if (!name.endsWith(".pdf") && !name.endsWith(".docx")) return false;
                pdf = name.endsWith(".pdf");
                if (!cursor.isNull(1) && (cursor.getLong(1) < 1 || cursor.getLong(1) > 10 * 1024 * 1024)) return false;
            }
            try (InputStream input = getContentResolver().openInputStream(uri)) {
                if (input == null) return false;
                byte[] signature = new byte[5];
                int total = 0, count;
                while (total < signature.length && (count = input.read(signature, total, signature.length - total)) > 0) total += count;
                return total == 5 && (pdf
                        ? signature[0] == '%' && signature[1] == 'P' && signature[2] == 'D' && signature[3] == 'F' && signature[4] == '-'
                        : signature[0] == 'P' && signature[1] == 'K');
            }
        } catch (Exception error) { return false; }
    }
    private void cancelFileChooser() {
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
    }
    private void navigateBack() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else finish();
    }
    @Override public void onBackPressed() { navigateBack(); }
    @Override protected void onSaveInstanceState(Bundle state) {
        if (webView != null) webView.saveState(state);
        super.onSaveInstanceState(state);
    }
    @Override protected void onPause() {
        if (webView != null) webView.onPause();
        CookieManager.getInstance().flush(); super.onPause();
    }
    @Override protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); if (billing != null) billing.resume(); }
    @Override protected void onDestroy() {
        destroyed = true; cancelFileChooser(); pendingDownload = null; downloads.shutdownNow();
        if (billing != null) billing.close();
        if (popup != null) popup.destroy();
        if (webView != null) { webView.stopLoading(); webView.destroy(); webView = null; }
        super.onDestroy();
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void toast(int message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
    private static final class PendingDownload {
        final byte[] bytes; final String mime, filename;
        PendingDownload(byte[] bytes, String mime, String filename) { this.bytes = bytes; this.mime = mime; this.filename = filename; }
    }
}
