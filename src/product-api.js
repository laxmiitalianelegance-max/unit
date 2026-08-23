import { resolveAccount } from "./accounts.js";
import {
  HttpError,
  errorResponse,
  json,
  readResponseJsonLimited,
} from "./runtime-utils.js";

const MAX_FORM_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 24 * 1024 * 1024;
const MAX_NATIVE_MEDIA_BYTES = 4 * 1024 * 1024;
const MAX_IMAGES = 8;
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function clean(value, max = 4000) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function safeFileName(value) {
  const name = clean(value || "file", 180).replace(/[^A-Za-z0-9._-]+/g, "-");
  return name || "file";
}

function encodeBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let raw = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    raw += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(raw);
}

async function requireAccount(request, env) {
  const account = await resolveAccount(request, env);
  if (!account)
    throw new HttpError(
      401,
      "Sign in with Google to use Products.",
      "authentication_required",
    );
  return account;
}

async function nativeRequest(request, env, path, init = {}) {
  if (!env.SELF)
    throw new HttpError(
      503,
      "SELF service binding is not configured.",
      "self_binding_missing",
    );
  const origin = new URL(request.url).origin;
  const response = await env.SELF.fetch(
    new Request(`${origin}${path}`, {
      ...init,
      headers: {
        origin,
        cookie: request.headers.get("cookie") || "",
        ...(init.headers || {}),
      },
    }),
  );
  const data = await readResponseJsonLimited(response, 512 * 1024);
  if (!response.ok) {
    throw new HttpError(
      response.status,
      data.error || "Native product service failed.",
      data.code || "native_product_error",
    );
  }
  return data;
}

async function saveMedia(request, env, account, file, kind) {
  if (!(file instanceof File) || file.size < 1) return null;
  const maxBytes = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    throw new HttpError(
      413,
      `${kind === "video" ? "Video" : "Image"} exceeds the upload limit.`,
      "media_too_large",
    );
  }
  if (kind === "image" && !IMAGE_TYPES.has(file.type.toLowerCase())) {
    throw new HttpError(
      415,
      "Product image format is not supported.",
      "invalid_image_type",
    );
  }
  if (kind === "video" && !VIDEO_TYPES.has(file.type.toLowerCase())) {
    throw new HttpError(
      415,
      "Product video format is not supported.",
      "invalid_video_type",
    );
  }

  const id = `media_${crypto.randomUUID().replace(/-/g, "")}`;
  const uploadedAt = new Date().toISOString();
  if (!env.FILES) {
    if (file.size > MAX_NATIVE_MEDIA_BYTES) {
      throw new HttpError(
        413,
        `${kind === "video" ? "Video" : "Image"} exceeds the 4 MiB built-in storage limit.`,
        "native_media_too_large",
      );
    }
    const stored = await nativeRequest(request, env, "/api/native/files", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: safeFileName(file.name),
        mime: file.type || "application/octet-stream",
        content: encodeBase64(await file.arrayBuffer()),
        meta: {
          encoding: "base64",
          kind: "product-media",
          media_kind: kind,
          uploaded_at: uploadedAt,
        },
      }),
    });
    return {
      id: stored.file.id,
      key: null,
      name: safeFileName(file.name),
      mime: file.type || "application/octet-stream",
      size: file.size,
      kind,
      storage: "native",
      uploaded_at: uploadedAt,
    };
  }

  const key = `users/${account.uid}/product-media/${id}/${safeFileName(file.name)}`;
  await env.FILES.put(key, file, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: {
      id,
      name: safeFileName(file.name),
      kind,
      uploaded_at: uploadedAt,
    },
  });
  return {
    id,
    key,
    name: safeFileName(file.name),
    mime: file.type || "application/octet-stream",
    size: file.size,
    kind,
    storage: "r2",
    uploaded_at: uploadedAt,
  };
}

async function removeMedia(request, env, item) {
  if (item.storage === "r2" && env.FILES && item.key) {
    await env.FILES.delete(item.key);
    return;
  }
  if (item.storage === "native" && item.id) {
    await nativeRequest(
      request,
      env,
      `/api/native/files/${encodeURIComponent(item.id)}`,
      { method: "DELETE" },
    );
  }
}

async function listProducts(request, env) {
  await requireAccount(request, env);
  const data = await nativeRequest(
    request,
    env,
    "/api/native/business/products",
  );
  const products = (data.products || []).map((entry) => {
    const value = entry.data || {};
    return {
      id: entry.id,
      title: value.title || value.name || entry.name || "",
      status: value.status || "DRAFT",
      productType: value.productType || "",
      vendor: value.vendor || "",
      price: Number(value.price || 0),
      currency: value.currency || "EUR",
      sku: value.sku || "",
      media: Array.isArray(value.media) ? value.media : [],
      native: true,
    };
  });
  return json({ products, native: true });
}

async function createProduct(request, env) {
  const account = await requireAccount(request, env);
  const declared = Number(request.headers.get("content-length") || 0);
  if (!declared)
    throw new HttpError(
      411,
      "Upload size is required.",
      "content_length_required",
    );
  if (declared > MAX_FORM_BYTES)
    throw new HttpError(
      413,
      "Product upload is too large.",
      "payload_too_large",
    );
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) {
    throw new HttpError(
      415,
      "Product creation requires multipart/form-data.",
      "unsupported_media_type",
    );
  }
  const form = await request.formData();
  const title = clean(form.get("title"), 300);
  const price = Number(clean(form.get("price"), 40).replace(",", "."));
  const sizes = clean(form.get("sizes"), 1000)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 80);
  if (!title)
    throw new HttpError(
      400,
      "Product name is required.",
      "product_name_required",
    );
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000_000) {
    throw new HttpError(
      400,
      "Price must be greater than zero and within the supported range.",
      "invalid_price",
    );
  }
  if (!sizes.length)
    throw new HttpError(400, "Enter at least one size.", "sizes_required");

  const images = form
    .getAll("images")
    .filter((value) => value instanceof File && value.size > 0);
  const video = form.get("video");
  if (images.length > MAX_IMAGES)
    throw new HttpError(
      400,
      `A product can contain at most ${MAX_IMAGES} images.`,
      "too_many_images",
    );
  const totalBytes =
    images.reduce((sum, file) => sum + file.size, 0) +
    (video instanceof File ? video.size : 0);
  if (totalBytes > MAX_FORM_BYTES)
    throw new HttpError(
      413,
      "Product media exceeds the total upload limit.",
      "media_total_too_large",
    );

  const media = [];
  try {
    for (const image of images)
      media.push(await saveMedia(request, env, account, image, "image"));
    if (video instanceof File && video.size > 0)
      media.push(await saveMedia(request, env, account, video, "video"));
    const payload = {
      name: title,
      title,
      price,
      sizes,
      description: clean(form.get("description"), 12_000),
      status:
        clean(form.get("status") || "DRAFT", 40).toUpperCase() === "ACTIVE"
          ? "ACTIVE"
          : "DRAFT",
      sku: clean(form.get("sku"), 160),
      productType: clean(form.get("productType"), 160),
      vendor: clean(form.get("vendor"), 160),
      tags: clean(form.get("tags"), 2000)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 40),
      currency: "EUR",
      stock: 0,
      media: media.filter(Boolean),
      source: "unit369-native",
    };
    const data = await nativeRequest(
      request,
      env,
      "/api/native/business/products",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    return json({ product: data.product, native: true }, 201);
  } catch (error) {
    await Promise.all(
      media
        .filter(Boolean)
        .map((item) => removeMedia(request, env, item).catch(() => undefined)),
    );
    throw error;
  }
}

export async function handleProductApi(request, env) {
  const url = new URL(request.url);
  try {
    if (url.pathname === "/api/products" && request.method === "GET")
      return listProducts(request, env);
    if (url.pathname === "/api/create-product" && request.method === "POST")
      return createProduct(request, env);
    return null;
  } catch (error) {
    return errorResponse(error, { path: url.pathname, method: request.method });
  }
}
