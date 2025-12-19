// src/components/GoogleAd.js
import { useEffect } from "react";

const GoogleAd = ({ adSlot, style }) => {
  useEffect(() => {
    // Load AdSense script if not already loaded
    if (!window.adsbygoogle) {
      const script = document.createElement("script");
      script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
      script.async = true;
      script.setAttribute("data-ad-client", "ca-pub-4395008227700572"); // <-- Your Publisher ID
      document.body.appendChild(script);
    }

    // Push the ad
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error("Adsense error:", e);
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={style || { display: "block", width: 300, height: 250 }}
data-ad-client="ca-pub-4395008227700572"
      data-ad-slot={adSlot} // <-- Your Ad slot ID
    ></ins>
  );
};

export default GoogleAd;
