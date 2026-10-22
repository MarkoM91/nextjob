/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.markom91.nextjob;

import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;



public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {




    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        // Get the original launch Url.
        Uri uri = super.getLaunchingUrl();
        Uri origin = Uri.parse(getString(R.string.launchUrl));
        int expectedPort = origin.getPort() == -1 ? 443 : origin.getPort();
        int actualPort = uri == null || uri.getPort() == -1 ? 443 : uri.getPort();
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())
                || !origin.getHost().equalsIgnoreCase(uri.getHost())
                || actualPort != expectedPort) {
            return uri;
        }
        if ("android".equals(uri.getQueryParameter("source"))) {
            return uri;
        }
        // Keep the original encoded query and fragment. Put the Android marker first so an
        // existing source value cannot route a fresh app deep link to the web checkout.
        String query = uri.getEncodedQuery();
        return uri.buildUpon().encodedQuery("source=android"
                + (query == null || query.isEmpty() ? "" : "&" + query)).build();
    }
}
