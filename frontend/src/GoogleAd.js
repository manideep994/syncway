import { useEffect, useRef } from "react";

const GoogleAd = ({ adSlot, style }) => {
  const adRef = useRef(null);

  useEffect(() => {
    if (window && window.adsbygoogle && adRef.current) {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.error("Adsense push error:", e);
      }
    }
  }, []);

  useEffect(() => {
    // Load the AdSense script only once
    if (!document.querySelector("script[src*='pagead2.googlesyndication.com']")) {
      const script = document.createElement("script");
      script.src =
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
      script.async = true;
      script.setAttribute("data-ad-client", "ca-pub-4395008227700572"); // Your Publisher ID
      script.crossOrigin = "anonymous";
      document.body.appendChild(script);
    }
  }, []);

  return (
    <ins
      ref={adRef}
      className="adsbygoogle"
      style={style || { display: "block", textAlign: "center" }}
      data-ad-client="ca-pub-4395008227700572"
      data-ad-slot={adSlot}
      data-ad-layout="in-article"
      data-ad-format="fluid"
    ></ins>
  );
};

export default GoogleAd;
