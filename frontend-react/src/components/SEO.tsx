import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
  canonical?: string;
  jsonLd?: Record<string, any>;
}

export function SEO({ 
  title, 
  description = "嘉祥记忆回廊 JX Memory - 记录嘉祥高2024级的美好回忆", 
  keywords = "嘉祥回忆,嘉祥时光回廊,嘉祥记忆回廊, 嘉祥Memory, 2024级回忆, 嘉祥高中, 嘉祥高2024级, 成都嘉祥外国语学校,  青春回忆, 校园生活",
  image = "/og-image.png", // Assuming we might add an OG image later
  url = window.location.href,
  type = "website",
  canonical,
  jsonLd
}: SEOProps) {
  const siteTitle = "记忆回廊";
  const fullTitle = title ? `${title} | ${siteTitle}` : siteTitle;
  const canonicalUrl = canonical || url;

  return (
    <Helmet>
      {/* Standard metadata tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Facebook Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:site_name" content={siteTitle} />

      {/* Twitter Card data */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* JSON-LD Structured Data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
}
