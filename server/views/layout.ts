import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { Locale } from "../../shared/i18n/index.js";

export function layout(
  locale: Locale,
  title: string,
  body: HtmlEscapedString,
): HtmlEscapedString {
  return html`<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="view-transition" content="same-origin" />
    <title>${title}</title>
    <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    ${body}
  </body>
</html>`;
}
