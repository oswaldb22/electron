/* global nodeProcess */

import type * as webViewElementModule from '@electron/internal/renderer/web-view/web-view-element';
import type * as guestViewInternalModule from '@electron/internal/renderer/web-view/guest-view-internal';

process._linkedBinding = nodeProcess._linkedBinding;

const v8Util = process._linkedBinding('electron_common_v8_util');

const guestViewInternal = v8Util.getHiddenValue(window, 'guest-view-internal') as typeof guestViewInternalModule;
if (guestViewInternal) {
  // Must setup the WebView element in main world.
  const { setupWebView } = require('@electron/internal/renderer/web-view/web-view-element') as typeof webViewElementModule;
  setupWebView(guestViewInternal);
}
