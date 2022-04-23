import "../styles/globals.css";
import type { AppProps } from "next/app";
import { useEffect } from "react";
import { useRouter } from "next/router";

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    import("react-facebook-pixel")
      .then((x) => x.default)
      .then((ReactPixel) => {
        ReactPixel.init("1893626964169463");
        ReactPixel.pageView();

        router.events.on("routeChangeComplete", () => {
          ReactPixel.pageView();
        });
      });

    import("react-gtm-module")
      .then((x) => x.default)
      .then((TagManager) => {
        TagManager.initialize({ gtmId: "GTM-PJQNVVP" });
      });
  }, [router.events]);

  return <Component {...pageProps} />;
}

export default MyApp;
