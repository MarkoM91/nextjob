package com.markom91.nextjob;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.net.Uri;
import android.webkit.CookieManager;
import com.android.billingclient.api.AccountIdentifiers;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import org.json.JSONObject;

/** Native billing with authenticated server verification; no JavaScript interface. */
final class PlayBillingController {
    private final Activity activity;
    private final WebUrlPolicy urls;
    private final String origin;
    private final Consumer<String> navigate;
    private final SharedPreferences preferences;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Set<String> processing = new HashSet<>();
    private final BillingClient client;
    private boolean closed, connecting, busy;
    private JSONObject activeOrder;
    private String activeFormat = "pdf";

    PlayBillingController(Activity activity, WebUrlPolicy urls, String origin, Consumer<String> navigate) {
        this.activity = activity; this.urls = urls; this.origin = origin; this.navigate = navigate;
        preferences = activity.getSharedPreferences("play-orders", Activity.MODE_PRIVATE);
        client = BillingClient.newBuilder(activity).setListener((result, purchases) -> activity.runOnUiThread(() -> {
            if (closed) return;
            busy = false;
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
                for (Purchase purchase : purchases) verify(purchase, true);
            } else if (result.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
                recover();
                message(R.string.billing_pending);
            } else if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
                if (activeOrder != null) go(activeOrder.optString("returnUrl"));
            } else { message(R.string.billing_failed); }
        })).enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection().build();
    }

    void resume() {
        if (closed) return;
        if (client.isReady()) { recover(); return; }
        if (connecting) return;
        connecting = true;
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) {
                activity.runOnUiThread(() -> {
                    connecting = false;
                    if (!closed && result.getResponseCode() == BillingClient.BillingResponseCode.OK) recover();
                });
            }
            @Override public void onBillingServiceDisconnected() { /* Library reconnects on the next call. */ }
        });
    }

    /** Called only for main-frame navigation on the exact configured HTTPS origin. */
    boolean handle(String url) {
        if (!urls.isOwnOrigin(url) || !"/android-billing".equals(Uri.parse(url).getPath())) return false;
        if (closed || busy) return true;
        String orderId = Uri.parse(url).getQueryParameter("order");
        String format = Uri.parse(url).getQueryParameter("format");
        if (orderId == null || !orderId.matches("[a-fA-F0-9-]{36}") || !validFormat(format)) { message(R.string.billing_failed); return true; }
        if (!client.isReady()) { resume(); message(R.string.billing_unavailable); return true; }
        busy = true; activeFormat = format;
        // Store only opaque order/format metadata, never payment tokens or CV content.
        preferences.edit().putString("format:" + orderId, format).apply();
        String cookie = CookieManager.getInstance().getCookie(origin);
        network.execute(() -> {
            try {
                JSONObject order = request("/api/payments/google-play?order=" + Uri.encode(orderId) + "&format=" + format, null, cookie);
                activity.runOnUiThread(() -> {
                    if (closed) return;
                    if (order.optBoolean("alreadyPurchased")) { busy = false; go(order.optString("returnUrl")); return; }
                    activeOrder = order;
                    queryProduct(order);
                });
            } catch (Exception error) { fail(R.string.billing_unavailable); }
        });
        return true;
    }

    private void queryProduct(JSONObject order) {
        QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(order.optString("productId")).setProductType(BillingClient.ProductType.INAPP).build();
        client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(product)).build(),
                (result, details) -> activity.runOnUiThread(() -> {
                    if (closed) return;
                    if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || details.getProductDetailsList().size() != 1) { fail(R.string.billing_unavailable); return; }
                    ProductDetails detail = details.getProductDetailsList().get(0);
                    List<ProductDetails.OneTimePurchaseOfferDetails> offers = detail.getOneTimePurchaseOfferDetailsList();
                    ProductDetails.OneTimePurchaseOfferDetails selected = null;
                    if (offers != null) for (ProductDetails.OneTimePurchaseOfferDetails offer : offers) {
                        if (order.optString("purchaseOptionId").equals(offer.getPurchaseOptionId()) && offer.getOfferId() == null) selected = offer;
                    }
                    if (selected == null || selected.getOfferToken() == null || selected.getOfferToken().isEmpty()) { fail(R.string.billing_unavailable); return; }
                    // In the reference currency, reject a misconfigured Play price before charging.
                    if (selected.getPriceCurrencyCode().equalsIgnoreCase(order.optString("currency"))
                            && selected.getPriceAmountMicros() != order.optLong("amountCents") * 10000L) { fail(R.string.billing_price_changed); return; }
                    ProductDetails.OneTimePurchaseOfferDetails chosen = selected;
                    String explanation = activity.getString(R.string.billing_confirm, chosen.getFormattedPrice(), order.optInt("redownloadDays"));
                    if (order.optBoolean("testOnly")) explanation += "\n\n" + activity.getString(R.string.billing_test_only);
                    // Always confirm the localized Google Play price; navigation itself never purchases.
                    new AlertDialog.Builder(activity).setTitle(R.string.billing_title).setMessage(explanation)
                            .setNegativeButton(android.R.string.cancel, (dialog, which) -> { busy = false; go(order.optString("returnUrl")); })
                            .setOnCancelListener(dialog -> { busy = false; go(order.optString("returnUrl")); })
                            .setPositiveButton(R.string.billing_continue, (dialog, which) -> {
                                BillingFlowParams.ProductDetailsParams item = BillingFlowParams.ProductDetailsParams.newBuilder()
                                        .setProductDetails(detail).setOfferToken(chosen.getOfferToken()).build();
                                BillingResult launch = client.launchBillingFlow(activity, BillingFlowParams.newBuilder()
                                        .setProductDetailsParamsList(Collections.singletonList(item))
                                        .setObfuscatedAccountId(order.optString("accountId"))
                                        .setObfuscatedProfileId(order.optString("profileId")).build());
                                if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                                    busy = false;
                                    if (launch.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) recover();
                                    message(R.string.billing_failed);
                                }
                            }).show();
                }));
    }

    private void recover() {
        if (closed || busy) return;
        client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
                (result, purchases) -> activity.runOnUiThread(() -> {
                    if (!closed && result.getResponseCode() == BillingClient.BillingResponseCode.OK) for (Purchase purchase : purchases) verify(purchase, false);
                }));
    }

    private void verify(Purchase purchase, boolean interactive) {
        if (closed) return;
        AccountIdentifiers identifiers = purchase.getAccountIdentifiers();
        if (identifiers == null || identifiers.getObfuscatedProfileId() == null) return;
        String token = purchase.getPurchaseToken();
        if (!processing.add(token)) return;
        String format = preferences.getString("format:" + identifiers.getObfuscatedProfileId(), activeFormat);
        if (!validFormat(format)) format = "pdf";
        String cookie = CookieManager.getInstance().getCookie(origin);
        String chosenFormat = format;
        network.execute(() -> {
            try {
                JSONObject data = new JSONObject().put("purchaseToken", token).put("format", chosenFormat);
                JSONObject verified = request("/api/payments/google-play", data, cookie);
                activity.runOnUiThread(() -> {
                    processing.remove(token);
                    if (closed) return;
                    if ("successful".equals(verified.optString("state"))) go(verified.optString("returnUrl"));
                    else if (interactive) { go(verified.optString("returnUrl")); message(R.string.billing_pending); }
                });
            } catch (Exception error) {
                activity.runOnUiThread(() -> { processing.remove(token); if (!closed && interactive) message(R.string.billing_pending); });
            }
        });
    }

    private JSONObject request(String path, JSONObject body, String cookie) throws Exception {
        if (!path.startsWith("/api/payments/google-play") || cookie == null || cookie.isEmpty()) throw new IllegalStateException();
        HttpURLConnection connection = (HttpURLConnection) new URL(origin + path).openConnection();
        try {
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(12000); connection.setReadTimeout(15000);
            connection.setRequestProperty("Cookie", cookie); connection.setRequestProperty("Origin", origin);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "NextJOBAndroid/" + activity.getString(R.string.app_version));
            if (body != null) {
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            }
            if (connection.getResponseCode() != 200) throw new IllegalStateException();
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[2048]; int count;
                while ((count = input.read(buffer)) != -1) { if (bytes.size() + count > 32768) throw new IllegalStateException(); bytes.write(buffer, 0, count); }
                return new JSONObject(bytes.toString("UTF-8"));
            }
        } finally { connection.disconnect(); }
    }
    private void go(String path) { if (!closed && path.startsWith("/checkout?") && urls.isOwnOrigin(origin + path)) navigate.accept(origin + path); }
    private static boolean validFormat(String value) { return "pdf".equals(value) || "docx".equals(value) || "txt".equals(value); }
    private void message(int resource) {
        if (!closed && !activity.isFinishing()) new AlertDialog.Builder(activity).setMessage(resource).setPositiveButton(android.R.string.ok, null).show();
    }
    private void fail(int resource) { activity.runOnUiThread(() -> { if (!closed) { busy = false; message(resource); } }); }
    void close() { closed = true; network.shutdownNow(); client.endConnection(); processing.clear(); }
}
