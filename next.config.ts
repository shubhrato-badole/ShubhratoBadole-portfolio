import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        /* fonts, the ring's texture decoder and models, and the two Contact pictures: cached for a day */
        source: "/contact-scene/:dir(models|fonts|basis)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
      {
        source: "/contact-scene/:file(lake-poster\\.jpg|garden-poster\\.jpg|noise\\.jpg)",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
};

export default nextConfig;
