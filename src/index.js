var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

const ICON_192_B64 = "iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAIAAADdvvtQAAAFnElEQVR4nO3dzW3bQBRFYTrISoDLSQ+pIC14T8BLt6A2DKSC9JAC3E4WBAxBshRx7vsdnW8ZILA4c/xImZT9dDgcFmDUt+wXgN4ICBICgoSAICEgSAgIEgKChIAgISBICAgSAoKEgCAhIEgICJLv2S+ghD+/fgz8r5+//5q/knaeHvB5oLFc7vGAST1EQH7F3PYIPc0cUFY3lyYuabaAIq9muHJaZgro/u3028IKryFY+4Du2bOs3ar82qw0Dui/21Nnbxq91L1aBnR7PypvRt9Xfk2zgG5sQK/Vn+ZA2gQ0zYqfmuCgegR0baG7rPJtrY+uekCtF3eXpkdaN6CmCypqd9RFA/pyHcsuorlGh18xoMvlq7l23lqsQ62AGn3nxai/IIUCavENl6LyylR5pLXyGqW7XIo6T6rkT6D6U7qImguVHBCDZ69qK5Z5Cqu2Fi1UO52lBUQ9w0o1lBMQ9YjqNJRwDXR2qKSjSF/M6AmUfsCTOVvA+DkUGhD1eMhtKC4g6vGT2FBQQNTjLauhKrcy0FREQIyfGClDyD0g6okU35BvQNQTL7ihuGsg6gkTudSOAdV5ZuXBuW6EV0CcvHKFnchcAqKeCmIacr8Gop5EAYtvHxCXPmV5bI3vBGL8pPPeAuOAThunniJON8J8CFkGxMmrBdtt8jqFMX5K8dsOs4AYP40YbpbLBGL8FOS0KTYBMX7asdoy+7/WkzJ+1nVd1zXmax2Px+PxGPO1bP38/bfiuzDGT1MmG2d8DcTVT3HmG6QGxPhpTd8+ywnE+GnBdpv4VAYk0mfjW9z5ent7e3l52fu/+r7VupPV3jGBIBkPiMvnaShbaTOByp6/cI3VlnEKg4SAIBkMqMX7L9xm8qQiEwgSAoJkJCDOX9PQz2JMIEgICBICgoSAINkdEFfQkxGvo5lAkBAQJAQECQFBQkCQ7AuIt2BTUt6IMYEgISBI7P/oLq75+Ph4fn4+/ZfX19f39/es12OCCQTJSEBcR09D/20ZTCBICAiSwYA4i03A5Lc9MYEgISBIbALiLNaO1ZaNB8TvSJwGfzceaZ4Oh4Py/4v83tZ1Xdd1zfrqw7JuZRjuGhMIEsuAuJRuwXab1IC4lG5N3z7jUxhDqDjzDTIIiCHUlMnGqe/CNmddk1RNHttkcwqjmHastszlbTxXQgU5bYpZQAyhRgw3y+sHiQyhUvy2wzIghlALtttkPIF4UrEg1/uVvvfCaCid9xbYB8SJrCyPrXG/G88QShSw+C4BnZVOQylibg94TSAayhV2c8nxFMbFUBGuGxH3RCJDKEzkUvsGxIksXvCTEe4TiIYixT9XE3EKo6EYKU9l8akMSIICYgh5y3ooNG4C0ZCfxEeKQ09hNOQh94H06GsgGrKV/nEGm09l7HXZDT+23qvIGua8C7s8VEbRLkXqWRLfxtPQsDr1LLk/B6KhAaXqWbKugU59GQ2XRJdqLlR+QJtq31jVlF2fKrcyOJ3dULaepc4E2tSc0onqL0itgDaVv+EitViHigEtHb7zXDU6/KIBLdevgWquo5V2R103oE27BR3W9EirB7Rpurh3an10PQJabr6rb7HQX5rgoNoEtJlgxTfTHEizgDa3f8ZYeQP6vvJrWga0+e+PquvsR6OXulfjgDb33PHI2p7Kr81K+4A+3X/vzG/PKryGYPMEtBm7BTu2nZFfq6zZAjpV537+ZNGcmjmgT1klTdzNp4cI6IxfT49QzJlHDOgSVzPDCAiSKo+0oikCgoSAICEgSAgIEgKChIAgISBICAgSAoKEgCAhIEgICBICguQfyl9Lez9xOuoAAAAASUVORK5CYII=";
const ICON_512_B64 = "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAQzUlEQVR4nO3dzXHcxhaAUdjlFWOQw1AOjsCBKCxFoAy8cBoK5C34SqYoctgAGuj7c87e8tRM9/3QPRL529PT0wZAP7+vfgEArCEAAE0JAEBTAgDQlAAANCUAAE0JAEBTAgDQlAAANCUAAE0JAEBTAgDQlAAANCUAAE0JAEBTAgDQlAAANCUAAE0JAEBTAgDQlAAANCUAAE0JAEBTAgDQlAAANCUAAE0JAEBTAgDQlAAANCUAAE0JAEBTAgDQlAAANCUAAE0JAEBTAgDQlAAANCUAAE0JAEBTf6x+ATDZt78/X/Qn//X134v+ZFjit6enp9WvAfa5bsSfIQ+kIwDEFXPQ7yUMhCUARFFj3I+QBIIQAJbpM/Ef0wNWEQBuZeg/JgbcSQC4lol/hh5wKQHgEub+XErAFQSAaQz9e4gBswgAZ5n7qygBJwkAB5n7cSgBxwgA+5j7kSkBuwgAQ3LN/SvmoHeAegSAR2JOvZjTzXtFOgLAG+LMsuzzyztJZALAT9YOrA5DyjtMHALAtq2bSuaRd56FBKC7+weQ0fMenwU3E4C+7hw3Bs1ePh1uIADt3DZZjJVZfGRcRAAauWeOGCLX8QkylwC0cPXgMDLu5zPlPAEo7tIxYUZE4CPmMAEoy7q5YCjE5BNnLwEoyCDozKfPOAEo5aLNb+dnZDHwIQEo4ordbqvXYG3wHgGoYPoOt73rsUj4lQDkZleziwXDSwKQ1dydbBt3Y/2wCUBGti6zWEvNCUAyE3es7cozi6otAUjDLuVSFlhDApDDrM1pZ/KYldaKAERnQ3I/q64JAQhtyj60CTnG8itPAIKy9wjCUixMACI6v+XsN+ayJksSgFhsMyKzPov5ffUL4D92F8GdX2B3/rJ7PuQEEILRTy5WbA0CsN7JvWQjsYqlm50roMVsIfI6ufxcBy3nBLCM0U8ZFnNSArDGmQ1jtxCTVZ2OK6AF7BNKOrM4XQct4QRwK6OfDqzzLJwA7mNX0ISjQBZOADc5vKyNfvKy7INzAriDbUBPhxewc8A9nACu5doH7IKwBOBCHvzhB9shIFdAV7Hc4SXXQQEJwCVMf/iVBkTjCmi+Y4vV6KcPeyQIJ4DJrGz40LEF7xwwnQDMZPrDIA2IwBXQHEY/HGPvLOQEMIEVDIc5CiwkAGeZ/nCSBqwiAKeY/jCFBiwhAMeZ/jCRBtzPl8AHHVh2Rj+MsLlu4wRwhAUK1zmwWZwDjhGA3Ux/uJoG3EMA9jH94R4acAMB2MH0hztpwNUEYJTpD/fTgEsJwBDTH1bRgOsIwMdMf1hLAy4iAPOZ/jCdbXUFAfjA3ucIyxQusndzOQR8SAAeMf0hFA2YSwDeZfpDQBowkQC8zfSHsDRgFgF4g+kPwWnAFALwmukPKWjAeQLwE9MfEtGAkwTgONMflrMNzxCA/+x6OrDsIIhdm9Eh4CUB+D/TH/LSgGMEYNtMf8hPAw4QAEsBOrLxNwHYy+M/hGV77tU9AC5/oBIXQbu0DoDpD/VowLi+ATD9oSoNGNQ3AONMf0jHth3RNACdmw+80nYgdAyAyx/owEXQh9oFwPSHPjTgsXYBGGf6QwE28gO9AtCw8MC4biOiUQBc/kBPLoLe0ygA40x/KMamflOXAIxX3UKBksa3dp9DQIsA9Pk4gSmaDI0WARjn8R8Ks8FfqR8Alz/ADy6CXioeANMfeEUDfigeAADeUzkAHv+BNzkEPCsbANMfeEADtsIBAOCxmgHw+A98yCGgYABMf2BQ8wYUDAAAI6oFwOM/sEvnQ0C1AAAwqFQAPP4DB7Q9BJQKwCDTH3il51ioE4BiZQZiqjRqigTA5Q9wUsOLoCIBAGCvCgHw+A9M0e0QUCEAg0x/4EOtBkX6ANToMJBOgeGTPgCDWlUdOKPPuMgdgAIFBvLKPoJyB2BQn54DUzQZGokDkL29QAGpB1HiAAxqUnJgrg6j44/VL+Cg1NWN7/v376tfQmifPn1a/RII5Nvfn5PWovgJIOmnAkRQfoCkDIDHfyCUpEMpZQAGla83cLXaYyRfAJKWFqgt42jKF4BBtbsN3KbwMCkbAAAeSxaAwUNW4WID9xscKelugZIFAIBZMgXA4z+wSslDQKYAADBRmgB4/AfWqncISBMAAOYSAICmcgTA/Q8QQbFboKw/DppLTflxx3/++ef///xz/s+ZyI9xhpcSnAA8/gNxVDoEJAgAAFcoEgCP/8Btygyc6AFIcYwC+FX88RU9AABcpEIAyhzHgCxqjJ3QAYh/gAJ4IPgQCx0AAK6TPgA1DmJAOgWGT9wABD86AYyIPMriBmBEgQIDeWUfQbkDAMBhQQMQ+dAEsEvYgRY0ACOyH76AAlIPosQBAOCMiAEIe1wCOCbmWIsYgBGpj11AJXnHUdYAAHBSuADEPCgBnBRwuIULAAD3SBmAvDduQElJh1LKAABwXqwABLwjA5gl2oiLFYARSY9aQG0ZR1O+AAAwRaAARDscAUwXatAFCgAAd0oWgIy3bEAT6QZUsgAAMIsAADQVJQChvhgBuE6ccRclACPS3a8B3eQaU5kCAMBEAgDQVIgAxLkRA7hBkKEXIgAjct2sAW0lGlZpAgDAXAIA0FQyAOS6XwNaSTegkgUAgFkCBSDOFyMAFwk16AIFAIA75QtAuls2oIOMoylWAEIdjgDmijbiYgUAgNukDEDGoxZQWNKhlDIAAJwXLgDR7sgApgg43MIFAIB7ZA1A0hs3oJ684yhiAAIelADOiDnWIgYAgBskDkDeYxdQRupBFDQAMY9LAAeEHWhBAwDA1XIHIPXhC8gu+wiKG4CwhyaAcZFHWdwADMpeYCCpAsMnfQAAOCZ0ACIfnQA+FHyIhQ7AoAIHMSCXGmOnQgAAOCB6AIIfoADeE398/bH6Bczx7e/P8d9rlvv+/fvql0AFNe5/tvgnAAAukuAE8NfXf0d66xAwkSdleM/g43+KceQEANBUjgAMtrTMxRwQU6XH/y1LAACYTgAAmkoTALdAwFrF7n+2RAEAYK5MAXAIAFap9/i/5QoAABMlC4BDAHC/ko//W7oAADBL2QA4BABTFB4m+QKQ7pAFdJBxNOULwLjC3QbuUXuMpAxAxtIChSUdSgl+HPQZfkb0MZ8+fVr9EmC92o//W9ITwJa2t0A9ecdR1gCMK99w4AodRkfiAOStLlBG6kGUOADjOpQcmKjJ0MgdgNTtBbLLPoJyB2Bck54D5/UZF+kDkL3AQFIFhk/6AIzrU3XgsFaDokIAxjvc6qMF9hofEQUe/7caAQDggCIBcAgATur2+L+VCcBW6CMBIqs0auoEYJxDAPBKz7FQKgAugoADGl7+PCsVAADGVQuAQwCwS9vH/61eAAAYVDAADgHAoM6P/1vJAGwaAAxoPv23qgEA4ENlA+AQADzg8X8rHIBNA4B3mP7PKgcAgAeKB8AhAHjF4/8PxQOwaQDwgun/Uv0A7KIBUJgN/kqLAHQoOTBRk6HRIgCbiyBoz+XPr7oEYBcNgGJs6jc1CsCuqlsuUMau7dzn8X9rFYCt2UcL7NVtRPQKwC4OAVCAjfxAuwC4CII+XP481i4AmwZAD6b/hzoGYOv6YQNvajsQmgZgF4cASMe2HdE3AC6CoCqXP4P6BmDTAKjI9B/XOgCbBkAtpv8u3QOwlwZAWLbnXgLgKQA6svE3AXjmIgiyc/lzgAD8nwZAXqb/MQLwHw2AjEz/wwTgOA2A5WzDMwTgJ3ufDiw+WGjvBvT4/4oAvKYBkILpf54AvEEDIDjTfwoBeJsGQFim/ywC8C4NgIBM/4kE4BENgFBM/7kE4AMaAEGY/tMJwHwaANPZVlcQgI8deI6wWGGiAxvK4/8IARiiAbCK6X8dARilAXA/0/9SArCDBsCdTP+rCcA+GgD3MP1vIAC7aQBczfS/hwAcoQFwHdP/Nr89PT2tfg1ZHZvpViq8x566mRPAcceWnaMAvMn0v58AnKIBMIXpv4QAnKUBcJLpv4oATKABcJjpv5AvgWeylGGc/bKcE8BMjgIwyPSPQAAm0wD4kOkfhCugSxwe6JY4tdkaoTgBXOLwYnUUoDDTPxoBuIoGwEumf0CugK51Zppb99RgF4QlAHfw7ENbFn9kroDu4DqInkz/4JwA7uMgTB9WewpOAPc5s6wdBUjE9M/CCWAB24OqrO1cnAAWcBSgJNM/HSeAZU6OchuGOCzmpARgMTuH1Czg1FwBLXZyA7gRYiHTPzsngBDOz3F7iTtZsTUIQCA2FfFZpZW4Agrk/MZwI8SlTP9inAAiss2IxposSQCCmvIsb8txnqVYmACEZu+xkOVXngBEN+ta3z5knFXXhADkYENyDyutFQFIY+Lf8LE5+ZUF1pAAJGOXMp1F1ZYA5DP3L/vbsZ1ZS80JQFa2LmdYP2wCkN30f/prJ9dmwfCSAFRgV/Mhi4RfCUARV/wUIDu8BmuD9whAKRf9MDi7PSOLgQ8JQEHX/UxQmz8+nz7jBKAsg6Abnzh7CUBxl/6GAHMhAh8xhwlAC1f/ohhj4n4+U84TgEbu+X1hBsd1fILMJQDt3PZrI82RWXxkXEQA+rrzFwibLHv5dLiBAHR3/++RN27e47PgZgLAtq0YPc8MIO88CwkAP1k1j551mEreYeIQAN6wdki9lH1geSeJTAB4JM78einmLPNekY4AMCTmdHvPFVPPO0A9AsA+ueZgN+Y+uwgABylBHOY+xwgAZynBKuY+JwkA0yjBPcx9ZhEALiEGcxn6XEEAuJYSnGHucykB4FZ68JiJz50EgGXE4JmhzyoCQBR9emDiE4QAEFeNJBj3hCUA5BMzDAY96QgA1VyXByOeYgQAoKnfV78AANYQAICmBACgKQEAaEoAAJoSAICmBACgKQEAaEoAAJoSAICmBACgKQEAaEoAAJoSAICmBACgKQEAaEoAAJoSAICmBACgKQEAaEoAAJoSAICmBACgKQEAaEoAAJoSAICmBACgKQEAaEoAAJoSAICmBACgKQEAaEoAAJoSAICmBACgKQEAaEoAAJoSAICmBACgqf8BuvTt5X0Fi6wAAAAASUVORK5CYII=";

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
__name(b64ToBytes, "b64ToBytes");

async function getShopifyAccessToken(env) {
  const res = await fetch(`https://${env.SHOPIFY_SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET, grant_type: "client_credentials" })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Ne mogu da dobijem Shopify access token: " + JSON.stringify(data));
  return data.access_token;
}
__name(getShopifyAccessToken, "getShopifyAccessToken");

async function shopifyGraphQL(env, accessToken, query, variables) {
  const res = await fetch(`https://${env.SHOPIFY_SHOP}/admin/api/2024-10/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query, variables })
  });
  const data = await res.json();
  if (data.errors) throw new Error("GraphQL greska: " + JSON.stringify(data.errors));
  return data.data;
}
__name(shopifyGraphQL, "shopifyGraphQL");

async function createStagedUploadAndSend(env, accessToken, videoBlob, finalName) {
  const mimeType = videoBlob.type || "video/mp4";
  const stagedQuery = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }
  `;
  const stagedData = await shopifyGraphQL(env, accessToken, stagedQuery, {
    input: [{ filename: finalName, mimeType, resource: "VIDEO", httpMethod: "POST", fileSize: String(videoBlob.size) }]
  });
  const stagedErrors = stagedData?.stagedUploadsCreate?.userErrors || [];
  if (stagedErrors.length) throw new Error("stagedUploadsCreate: " + JSON.stringify(stagedErrors));
  const target = stagedData?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) throw new Error("Shopify nije vratio staged upload target.");
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", videoBlob, finalName);
  const upload = await fetch(target.url, { method: "POST", body: form });
  if (!upload.ok) throw new Error("Shopify upload nije uspeo: " + upload.status);
  return target;
}
__name(createStagedUploadAndSend, "createStagedUploadAndSend");

async function handleCreateProduct(request, env) {
  try {
    if (!env.SHOPIFY_SHOP || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
      return Response.json({ ok: false, error: "Shopify promenljive nisu podesene na ovom Workeru." }, { status: 500 });
    }
    const form = await request.formData();
    const title = String(form.get("title") || "").trim();
    const description = String(form.get("description") || "").trim();
    const priceRaw = String(form.get("price") || "").trim().replace(",", ".");
    const price = Number(priceRaw);
    const sizesRaw = String(form.get("sizes") || "").trim();
    const sizes = sizesRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const videoFile = form.get("video");

    if (!title) return Response.json({ ok: false, error: "Nedostaje naziv proizvoda." }, { status: 400 });
    if (!price || Number.isNaN(price) || price <= 0) return Response.json({ ok: false, error: "Cena mora biti broj veci od 0." }, { status: 400 });
    if (!sizes.length) return Response.json({ ok: false, error: "Unesi bar jednu velicinu." }, { status: 400 });
    if (!videoFile || typeof videoFile === "string") return Response.json({ ok: false, error: "Nedostaje video fajl." }, { status: 400 });

    const accessToken = await getShopifyAccessToken(env);

    const productCreateQuery = `
      mutation productCreate($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product { id variants(first: 50) { nodes { id title selectedOptions { name value } } } }
          userErrors { field message }
        }
      }
    `;
    const productData = await shopifyGraphQL(env, accessToken, productCreateQuery, {
      product: {
        title,
        descriptionHtml: description ? `<p>${description.replace(/</g, "&lt;")}</p>` : "",
        status: "ACTIVE",
        productOptions: [{ name: "Velicina", values: sizes.map((v) => ({ name: v })) }]
      }
    });
    const productErrors = productData?.productCreate?.userErrors || [];
    if (productErrors.length) throw new Error("productCreate: " + JSON.stringify(productErrors));
    const product = productData?.productCreate?.product;
    if (!product) throw new Error("Shopify nije vratio kreiran proizvod.");

    const variantIds = (product.variants?.nodes || []).map((v) => v.id);
    if (variantIds.length) {
      const bulkUpdateQuery = `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
        }
      `;
      const variantsInput = variantIds.map((id) => ({ id, price: price.toFixed(2) }));
      const bulkData = await shopifyGraphQL(env, accessToken, bulkUpdateQuery, { productId: product.id, variants: variantsInput });
      const bulkErrors = bulkData?.productVariantsBulkUpdate?.userErrors || [];
      if (bulkErrors.length) throw new Error("productVariantsBulkUpdate: " + JSON.stringify(bulkErrors));
    }

    const finalName = (videoFile.name || "video.mp4").replace(/[^a-zA-Z0-9._-]/g, "_");
    const target = await createStagedUploadAndSend(env, accessToken, videoFile, finalName);

    const mediaQuery = `
      mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { alt mediaContentType }
          mediaUserErrors { field message }
        }
      }
    `;
    const mediaData = await shopifyGraphQL(env, accessToken, mediaQuery, {
      productId: product.id,
      media: [{ originalSource: target.resourceUrl, mediaContentType: "VIDEO", alt: title }]
    });
    const mediaErrors = mediaData?.productCreateMedia?.mediaUserErrors || [];
    if (mediaErrors.length) throw new Error("productCreateMedia: " + JSON.stringify(mediaErrors));

    const shopHandle = String(env.SHOPIFY_SHOP || "").split(".")[0];
    const numericId = String(product.id).split("/").pop();
    const adminUrl = shopHandle ? `https://admin.shopify.com/store/${shopHandle}/products/${numericId}` : null;

    return Response.json({ ok: true, productId: product.id, adminUrl });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
__name(handleCreateProduct, "handleCreateProduct");

async function handleFreeAi(request, env) {
  try {
    if (!env.AI) return json({ error: "Workers AI binding nije podesen na ovom Workeru (Settings -> Bindings -> Add -> Workers AI)." }, 500);
    const incoming = await request.json();
    const userSystem = incoming.messages?.find((m) => m.role === "system")?.content;
    const langInstruction = "IMPORTANT: Always reply in the exact same language the user's message is written in. Match their language precisely, including regional variants (e.g. Serbian, Croatian, Vietnamese, etc). Never switch to a different language than the one used in the user's message.";
    const system = userSystem ? `${langInstruction}\n\n${userSystem}` : langInstruction;
    const userMessages = (incoming.messages || []).filter((m) => m.role !== "system");
    const result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [{ role: "system", content: system }, ...userMessages],
      max_tokens: 1000
    });
    const text = String(result?.response || "").trim();
    return json({ choices: [{ message: { content: text || "(prazan odgovor)" } }] });
  } catch (error) {
    return json({ error: String(error.message || error) }, 500);
  }
}
__name(handleFreeAi, "handleFreeAi");

async function handleAiProxy(request, env) {
  try {
    const provider = (request.headers.get("x-provider") || "openai").toLowerCase();

    if (provider === "claude") {
      if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY nije podesen na ovom Workeru (Settings -> Variables and Secrets)." }, 500);
      const anthropicKey = String(env.ANTHROPIC_API_KEY).trim();
      const incoming = await request.json();
      const system = incoming.messages?.find((m) => m.role === "system")?.content;
      const userMessages = (incoming.messages || []).filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system, messages: userMessages })
      });
      const data = await upstream.json();
      if (!upstream.ok) return json({ error: data }, upstream.status);
      const block = (data.content || []).find((b) => b.type === "text");
      return json({ choices: [{ message: { content: block?.text || "" } }] });
    }

    const apiKey = request.headers.get("x-api-key");
    if (!apiKey) return json({ error: "Nedostaje x-api-key header" }, 400);
    const endpoints = { openai: "https://api.openai.com/v1/chat/completions", grok: "https://api.x.ai/v1/chat/completions" };
    const targetUrl = endpoints[provider];
    if (!targetUrl) return json({ error: "Nepoznat provider: " + provider }, 400);
    const body = await request.text();
    const upstream = await fetch(targetUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body });
    const responseBody = await upstream.text();
    return new Response(responseBody, { status: upstream.status, headers: { "content-type": "application/json" } });
  } catch (error) {
    return json({ error: String(error.message || error) }, 500);
  }
}
__name(handleAiProxy, "handleAiProxy");

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
__name(json, "json");

function renderManifest() {
  return JSON.stringify({
    name: "Unit",
    short_name: "Unit",
    start_url: "/",
    display: "standalone",
    background_color: "#17130f",
    theme_color: "#17130f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  });
}
__name(renderManifest, "renderManifest");

function renderServiceWorker() { return "\nconst CACHE = \"unit-v1\";\nself.addEventListener(\"install\", (e) => { self.skipWaiting(); });\nself.addEventListener(\"activate\", (e) => { self.clients.claim(); });\nself.addEventListener(\"fetch\", (e) => {\n  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));\n});\n"; }
__name(renderServiceWorker, "renderServiceWorker");

function renderApp() { return `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Unit</title>
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icon-192.png">
<link rel="apple-touch-icon" href="/icon-192.png">
<meta name="theme-color" content="#17130f">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&display=swap" rel="stylesheet">
<style>
  :root { --bg:#17130f; --surface:#201a14; --surface-2:#29221a; --line:#3d3226; --line-soft:#2a2219; --gold:#c9a15f; --gold-dim:#8f7548; --wine:#8a2a35; --ink:#f2ead9; --ink-dim:#a89880; --ink-faint:#6f6250; --sage:#8faa74; --brick:#c1554a; }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { margin:0; background:radial-gradient(1200px 600px at 50% -10%, rgba(201,161,95,0.06), transparent 60%),var(--bg); color:var(--ink); font-family:-apple-system,system-ui,sans-serif; padding-bottom:78px; }
  h1,.display { font-family:"Fraunces",Georgia,serif; font-weight:500; }
  header { padding:26px 20px 18px; position:relative; }
  header::after { content:""; display:block; margin-top:16px; border-bottom:1px dashed var(--line); }
  .eyebrow { font-family:"Fraunces",Georgia,serif; font-style:italic; font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--gold); margin:0 0 6px; }
  h1 { font-size:26px; letter-spacing:.01em; margin:0 0 4px; color:var(--ink); }
  p.sub { color:var(--ink-dim); font-size:12.5px; margin:0; letter-spacing:.01em; }
  .page { display:none; padding:20px; max-width:560px; margin:0 auto; }
  .page.active { display:block; }
  label { display:block; font-family:"Fraunces",Georgia,serif; font-size:10.5px; text-transform:uppercase; letter-spacing:.14em; color:var(--ink-faint); margin-top:16px; margin-bottom:7px; }
  input,textarea { width:100%; background:var(--surface); border:1px solid var(--line); border-radius:3px; padding:11px 12px; color:var(--ink); font-size:15px; font-family:inherit; }
  input:focus,textarea:focus { outline:none; border-color:var(--gold-dim); }
  textarea { min-height:70px; resize:vertical; }
  button.primary { width:100%; margin-top:22px; padding:14px; border:1px solid var(--gold); border-radius:3px; background:var(--gold); color:#1a1510; font-family:"Fraunces",Georgia,serif; font-size:14px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; }
  button.primary:disabled { opacity:.4; }
  #pStatus { margin-top:14px; font-size:13px; white-space:pre-wrap; line-height:1.5; }
  #pStatus.ok { color:var(--sage); } #pStatus.err { color:var(--brick); } #pStatus.loading { color:var(--ink-dim); } #pStatus a { color:var(--sage); }
  .keys { background:var(--surface); border:1px solid var(--line-soft); border-radius:3px; padding:12px 14px 14px; margin-bottom:14px; }
  .keys label { margin-top:8px; color:var(--ink-faint); } .keys label:first-child { margin-top:0; }
  .keys input { font-family:"SF Mono",Menlo,monospace; font-size:12.5px; background:var(--bg); }
  .toggle-keys { font-size:11px; color:var(--ink-faint); margin-top:10px; display:inline-block; letter-spacing:.03em; }
  .modes { display:flex; gap:0; margin-bottom:16px; border:1px solid var(--line); border-radius:3px; overflow:hidden; }
  .mode { flex:1; padding:10px 6px; font-size:11px; letter-spacing:.03em; color:var(--ink-faint); text-align:center; border-right:1px solid var(--line); background:var(--surface); }
  .mode:last-child { border-right:none; } .mode.active { color:var(--gold); background:var(--surface-2); }
  .promptbox { background:var(--surface); border:1px solid var(--line); border-radius:3px; padding:12px; }
  .promptbox textarea { border:none; background:transparent; padding:4px; min-height:60px; }
  .sendrow { display:flex; justify-content:flex-end; margin-top:8px; border-top:1px dashed var(--line-soft); padding-top:10px; }
  .sendbtn { padding:9px 20px; border:1px solid var(--gold); border-radius:3px; background:transparent; color:var(--gold); font-family:"Fraunces",Georgia,serif; font-size:13px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; }
  .sendbtn:disabled { opacity:.4; }
  .panels { display:flex; flex-direction:column; gap:12px; margin-top:16px; }
  .panel { border:1px solid var(--line-soft); border-radius:3px; background:var(--surface); overflow:hidden; }
  .panel-head { padding:9px 13px; font-family:"Fraunces",Georgia,serif; font-size:11px; text-transform:uppercase; letter-spacing:.1em; border-bottom:1px dashed var(--line); display:flex; align-items:center; gap:8px; }
  .dot { width:6px; height:6px; transform:rotate(45deg); }
  .panel-body { padding:13px; font-size:14px; line-height:1.6; white-space:pre-wrap; word-break:break-word; color:var(--ink); }
  .panel-body.err { color:var(--brick); } .panel-body.loading { color:var(--ink-dim); font-style:italic; }
  nav.bottomnav { position:fixed; bottom:0; left:0; right:0; display:flex; background:var(--surface); border-top:1px solid var(--line); padding-bottom:env(safe-area-inset-bottom); }
  nav.bottomnav .navitem { flex:1; text-align:center; padding:12px 4px 10px; font-family:"Fraunces",Georgia,serif; font-size:11px; letter-spacing:.05em; color:var(--ink-faint); border-top:2px solid transparent; }
  nav.bottomnav .navitem.active { color:var(--gold); border-top-color:var(--gold); }
</style>
</head>
<body>
<header><p class="eyebrow">Laxmi &middot; Italian Elegance</p><h1>Unit</h1><p class="sub">AI tim i unos proizvoda, na jednom mestu.</p></header>
<div class="page active" id="page-team">
  <div class="keys"><label>OpenAI API kljuc</label><input type="password" id="openaiKey" placeholder="sk-..."><label>xAI (Grok) API kljuc</label><input type="password" id="grokKey" placeholder="xai-..."><span class="toggle-keys" id="toggleKeys">prikazi kljuceve</span></div>
  <div class="modes"><div class="mode active" data-mode="side">Jedan pored drugog</div><div class="mode" data-mode="combine">Spojeni odgovor</div><div class="mode" data-mode="critique">Unakrsna kritika</div></div>
  <div class="promptbox"><textarea id="prompt" placeholder="Postavi pitanje svim modelima..."></textarea><div class="sendrow"><button class="sendbtn" id="sendBtn">Posalji</button></div></div>
  <div class="panels" id="panels"></div>
</div>
<div class="page" id="page-product">
  <form id="f"><label>Naziv proizvoda</label><input type="text" name="title" required placeholder="npr. Korset haljina od brokata"><label>Cena (EUR)</label><input type="text" name="price" required inputmode="decimal" placeholder="npr. 290"><label>Velicine (odvojene zarezom)</label><input type="text" name="sizes" required placeholder="npr. 34,36,38,40,42,44"><label>Opis</label><textarea name="description" placeholder="Kratak opis (opciono)"></textarea><label>Video</label><input type="file" name="video" accept="video/*" required><button type="submit" class="primary" id="submitBtn">Dodaj proizvod</button></form>
  <div id="pStatus"></div>
</div>
<nav class="bottomnav"><div class="navitem active" data-page="team">AI Tim</div><div class="navitem" data-page="product">Novi proizvod</div></nav>
<script>
window.onerror=function(msg,src,line,col,err){document.body.insertAdjacentHTML("afterbegin",'<div style="background:#3a0d0d;color:#fca5a5;padding:12px;font-size:12px;font-family:monospace;word-break:break-word;">GRESKA: '+msg+' (linija '+line+', kolona '+col+')</div>');return false;};
if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
document.querySelectorAll(".navitem").forEach((el)=>{el.addEventListener("click",()=>{document.querySelectorAll(".navitem").forEach((n)=>n.classList.remove("active"));document.querySelectorAll(".page").forEach((p)=>p.classList.remove("active"));el.classList.add("active");document.getElementById("page-"+el.dataset.page).classList.add("active");});});
const openaiKeyEl=document.getElementById("openaiKey"); const grokKeyEl=document.getElementById("grokKey");
openaiKeyEl.value=localStorage.getItem("openaiKey")||""; grokKeyEl.value=localStorage.getItem("grokKey")||"";
openaiKeyEl.addEventListener("input",()=>localStorage.setItem("openaiKey",openaiKeyEl.value)); grokKeyEl.addEventListener("input",()=>localStorage.setItem("grokKey",grokKeyEl.value));
document.getElementById("toggleKeys").addEventListener("click",(e)=>{const t=openaiKeyEl.type==="password"?"text":"password"; openaiKeyEl.type=t; grokKeyEl.type=t; e.target.textContent=t==="text"?"sakrij kljuceve":"prikazi kljuceve";});
let mode="side"; document.querySelectorAll(".mode").forEach((el)=>{el.addEventListener("click",()=>{document.querySelectorAll(".mode").forEach((m)=>m.classList.remove("active"));el.classList.add("active");mode=el.dataset.mode;});});
async function askClaude(prompt,system){const messages=system?[{role:"system",content:system},{role:"user",content:prompt}]:[{role:"user",content:prompt}];const res=await fetch("/api/ai-proxy",{method:"POST",headers:{"Content-Type":"application/json","x-provider":"claude"},body:JSON.stringify({messages})});const data=await res.json();if(!res.ok||data.error) throw new Error("Claude greska: "+JSON.stringify(data.error||res.status).slice(0,150));return data.choices?.[0]?.message?.content?.trim()||"(prazan odgovor)";}
async function askViaProxy(provider,model,prompt,apiKey,system){if(!apiKey) throw new Error("Nedostaje API kljuc za "+provider);const messages=system?[{role:"system",content:system},{role:"user",content:prompt}]:[{role:"user",content:prompt}];const res=await fetch("/api/ai-proxy",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"x-provider":provider},body:JSON.stringify({model,messages,max_tokens:1000})});if(!res.ok){const t=await res.text();throw new Error(provider+" greska: "+res.status+" - "+t.slice(0,150));}const data=await res.json();if(data.error) throw new Error(provider+" greska: "+JSON.stringify(data.error).slice(0,150));return data.choices?.[0]?.message?.content?.trim()||"(prazan odgovor)";}
const askGPT=(p,k,s)=>askViaProxy("openai","gpt-4o",p,k,s); const askGrok=(p,k,s)=>askViaProxy("grok","grok-4",p,k,s);
async function askFree(prompt,system){const messages=system?[{role:"system",content:system},{role:"user",content:prompt}]:[{role:"user",content:prompt}];const res=await fetch("/api/free-ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages})});const data=await res.json();if(!res.ok||data.error) throw new Error("Besplatni AI greska: "+JSON.stringify(data.error||res.status).slice(0,150));return data.choices?.[0]?.message?.content?.trim()||"(prazan odgovor)";}
function panelHtml(id,title,color){return '<div class="panel"><div class="panel-head" style="color:'+color+'"><span class="dot" style="background:'+color+'"></span>'+title+'</div><div class="panel-body loading" id="'+id+'">radi...</div></div>';}
function setPanel(id,text,isErr){const el=document.getElementById(id); if(!el) return; el.className="panel-body"+(isErr?" err":""); el.textContent=text;}
const sendBtn=document.getElementById("sendBtn"), promptEl=document.getElementById("prompt"), panelsEl=document.getElementById("panels");
sendBtn.addEventListener("click",async()=>{const prompt=promptEl.value.trim();if(!prompt){panelsEl.innerHTML='<div class="panel"><div class="panel-body err">Prvo upisi pitanje u polje iznad.</div></div>';return;}const openaiKey=openaiKeyEl.value.trim();const grokKey=grokKeyEl.value.trim();sendBtn.disabled=true;panelsEl.innerHTML=panelHtml("p-claude","Claude","#c9a15f")+panelHtml("p-gpt","ChatGPT","#8faa74")+panelHtml("p-grok","Grok","#b3566a")+panelHtml("p-free","Besplatni AI","#7c8bae");let claudeAnswer="",gptAnswer="",grokAnswer="",freeAnswer="";const claudeP=askClaude(prompt).then((t)=>{claudeAnswer=t;setPanel("p-claude",t,false);}).catch((e)=>setPanel("p-claude",e.message,true));const gptP=askGPT(prompt,openaiKey).then((t)=>{gptAnswer=t;setPanel("p-gpt",t,false);}).catch((e)=>setPanel("p-gpt",e.message,true));const grokP=askGrok(prompt,grokKey).then((t)=>{grokAnswer=t;setPanel("p-grok",t,false);}).catch((e)=>setPanel("p-grok",e.message,true));const freeP=askFree(prompt).then((t)=>{freeAnswer=t;setPanel("p-free",t,false);}).catch((e)=>setPanel("p-free",e.message,true));await Promise.all([claudeP,gptP,grokP,freeP]);const answers=[claudeAnswer&&("Odgovor A (Claude):\n"+claudeAnswer),gptAnswer&&("Odgovor B (ChatGPT):\n"+gptAnswer),grokAnswer&&("Odgovor C (Grok):\n"+grokAnswer),freeAnswer&&("Odgovor D (Besplatni AI):\n"+freeAnswer)].filter(Boolean);if(mode==="combine"&&answers.length>=2){panelsEl.insertAdjacentHTML("beforeend",panelHtml("p-combined","Spojeni odgovor","#a89880"));try{const merged=await askClaude('Pitanje korisnika bilo je: "'+prompt+'"\n\n'+answers.join("\n\n")+'\n\nNapisi jedan spojen, najbolji moguci finalni odgovor. Odgovori direktno, bez meta-komentara.');setPanel("p-combined",merged,false);}catch(e){setPanel("p-combined",e.message,true);}}sendBtn.disabled=false;});
const form=document.getElementById("f"),pStatus=document.getElementById("pStatus"),submitBtn=document.getElementById("submitBtn");
form.addEventListener("submit",async(e)=>{e.preventDefault();submitBtn.disabled=true;pStatus.className="loading";pStatus.textContent="Otpremam video i kreiram proizvod... (moze potrajati, ne zatvaraj stranicu)";const formData=new FormData(form);try{const res=await fetch("/api/create-product",{method:"POST",body:formData});const data=await res.json();if(data.ok){pStatus.className="ok";pStatus.innerHTML="Gotovo! Proizvod je kreiran."+(data.adminUrl?'<br><a href="'+data.adminUrl+'" target="_blank">Otvori u Shopify adminu</a>':"");form.reset();}else{pStatus.className="err";pStatus.textContent="Greska: "+(data.error||"nepoznata greska");}}catch(err){pStatus.className="err";pStatus.textContent="Greska u vezi: "+err.message;}finally{submitBtn.disabled=false;}});
</script>
</body>
</html>`; }
__name(renderApp, "renderApp");

var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/manifest.json") return new Response(renderManifest(), { headers: { "content-type": "application/manifest+json" } });
    if (url.pathname === "/sw.js") return new Response(renderServiceWorker(), { headers: { "content-type": "application/javascript" } });
    if (url.pathname === "/icon-192.png") return new Response(b64ToBytes(ICON_192_B64), { headers: { "content-type": "image/png" } });
    if (url.pathname === "/icon-512.png") return new Response(b64ToBytes(ICON_512_B64), { headers: { "content-type": "image/png" } });
    if (url.pathname === "/api/create-product" && request.method === "POST") return handleCreateProduct(request, env);
    if (url.pathname === "/api/debug-key") {
      const k = String(env.ANTHROPIC_API_KEY || "");
      return Response.json({ postoji: !!env.ANTHROPIC_API_KEY, duzina: k.length, pocetak: k.slice(0, 8), kraj: k.slice(-4) });
    }
    if (url.pathname === "/api/free-ai" && request.method === "POST") return handleFreeAi(request, env);
    if (url.pathname === "/api/ai-proxy" && request.method === "POST") return handleAiProxy(request, env);
    if (url.pathname === "/api/ai-proxy" && request.method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, x-api-key, x-provider" } });
    }
    return new Response(renderApp(), { headers: { "content-type": "text/html; charset=utf-8" } });
  }
};
export { worker_default as default };
