// When using context isolation, the WebViewElement and the custom element
// methods have to be defined in the main world to be able to be registered.
//
// Note: The hidden values can only be read/set inside the same context, all
// methods that access the "internal" hidden value must be put in this file.
//
// Note: This file could be loaded in the main world of contextIsolation page,
// which runs in browserify environment instead of Node environment, all native
// modules must be passed from outside, all included files must be plain JS.

import { WEB_VIEW_CONSTANTS } from '@electron/internal/renderer/web-view/web-view-constants';
import * as webViewImpl from '@electron/internal/renderer/web-view/web-view-impl';
import type { SrcAttribute } from '@electron/internal/renderer/web-view/web-view-attributes';
import type * as guestViewInternalModule from '@electron/internal/renderer/web-view/guest-view-internal';

const { mainFrame } = process._linkedBinding('electron_renderer_web_frame');

const internals = new WeakMap<HTMLElement, webViewImpl.WebViewImpl>();

// Return a WebViewElement class that is defined in this context.
const defineWebViewElement = (guestViewInternal: typeof guestViewInternalModule) => {
  return class WebViewElement extends HTMLElement {
    public internalInstanceId?: number;

    static get observedAttributes () {
      return [
        WEB_VIEW_CONSTANTS.ATTRIBUTE_PARTITION,
        WEB_VIEW_CONSTANTS.ATTRIBUTE_SRC,
        WEB_VIEW_CONSTANTS.ATTRIBUTE_HTTPREFERRER,
        WEB_VIEW_CONSTANTS.ATTRIBUTE_USERAGENT,
        WEB_VIEW_CONSTANTS.ATTRIBUTE_NODEINTEGRATION,
        WEB_VIEW_CONSTANTS.ATTRIBUTE_NODEINTEGRATIONINSUBFRAMES,
        WEB_VIEW_CONSTANTS.ATTRIBUTE_PLUGINS,
        WEB_VIEW_CONSTANTS.ATTRIBUTE_DISABLEWEBSECURITY,
        WEB_VIEW_CONSTANTS.ATTRIBUTE_ALLOWPOPUPS,
        WEB_VIEW_CONSTANTS.ATTRIBUTE_PRELOAD,
        WEB_VIEW_CONSTANTS.ATTRIBUTE_BLINKFEATURES,
        WEB_VIEW_CONSTANTS.ATTRIBUTE_DISABLEBLINKFEATURES,
        WEB_VIEW_CONSTANTS.ATTRIBUTE_WEBPREFERENCES
      ];
    }

    constructor () {
      super();
      internals.set(this, new webViewImpl.WebViewImpl(this, guestViewInternal));
    }

    getWebContentsId () {
      const internal = internals.get(this)!;
      if (!internal.guestInstanceId) {
        throw new Error(WEB_VIEW_CONSTANTS.ERROR_MSG_NOT_ATTACHED);
      }
      return internal.guestInstanceId;
    }

    connectedCallback () {
      const internal = internals.get(this);
      if (!internal) {
        return;
      }
      if (!internal.elementAttached) {
        guestViewInternal.registerEvents(internal.viewInstanceId, {
          dispatchEvent: internal.dispatchEvent.bind(internal),
          reset: internal.reset.bind(internal)
        });
        internal.elementAttached = true;
        (internal.attributes.get(WEB_VIEW_CONSTANTS.ATTRIBUTE_SRC) as SrcAttribute).parse();
      }
    }

    attributeChangedCallback (name: string, oldValue: any, newValue: any) {
      const internal = internals.get(this);
      if (internal) {
        internal.handleWebviewAttributeMutation(name, oldValue, newValue);
      }
    }

    disconnectedCallback () {
      const internal = internals.get(this);
      if (!internal) {
        return;
      }
      guestViewInternal.deregisterEvents(internal.viewInstanceId);
      if (internal.guestInstanceId) {
        guestViewInternal.detachGuest(internal.guestInstanceId);
      }
      internal.elementAttached = false;
      this.internalInstanceId = 0;
      internal.reset();
    }
  };
};

// Register <webview> custom element.
const registerWebViewElement = (guestViewInternal: typeof guestViewInternalModule) => {
  // I wish eslint wasn't so stupid, but it is
  // eslint-disable-next-line
  const WebViewElement = defineWebViewElement(guestViewInternal) as unknown as typeof ElectronInternal.WebViewElement

  webViewImpl.setupMethods(WebViewElement, guestViewInternal);

  // The customElements.define has to be called in a special scope.
  mainFrame.allowGuestViewElementDefinition(window, () => {
    window.customElements.define('webview', WebViewElement);
    window.WebView = WebViewElement;

    // Delete the callbacks so developers cannot call them and produce unexpected
    // behavior.
    delete WebViewElement.prototype.connectedCallback;
    delete WebViewElement.prototype.disconnectedCallback;
    delete WebViewElement.prototype.attributeChangedCallback;

    // Now that |observedAttributes| has been retrieved, we can hide it from
    // user code as well.
    // TypeScript is concerned that we're deleting a read-only attribute
    delete (WebViewElement as any).observedAttributes;
  });
};

// Prepare to register the <webview> element.
export const setupWebView = (guestViewInternal: typeof guestViewInternalModule) => {
  const useCapture = true;
  const listener = (event: Event) => {
    if (document.readyState === 'loading') {
      return;
    }

    registerWebViewElement(guestViewInternal);

    window.removeEventListener(event.type, listener, useCapture);
  };

  window.addEventListener('readystatechange', listener, useCapture);
};
