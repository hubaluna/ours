import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const origin = "https://hubaluna.github.io";
const cors = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PlantNetResult = {
  score?: number;
  species?: {
    scientificNameWithoutAuthor?: string;
    scientificName?: string;
    genus?: { scientificNameWithoutAuthor?: string };
    family?: { scientificNameWithoutAuthor?: string };
    commonNames?: string[];
  };
};

function careFor(result: PlantNetResult) {
  const species = result.species;
  const taxon = [
    species?.scientificNameWithoutAuthor,
    species?.genus?.scientificNameWithoutAuthor,
    species?.family?.scientificNameWithoutAuthor,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/cactaceae|opuntia|mammillaria|echinopsis|gymnocalycium/.test(taxon))
    return {
      interval: 21,
      light: "Пряме сонце",
      notes: "Поливай лише після повного висихання ґрунту. Взимку — рідше.",
    };
  if (/crassulaceae|aloe|haworthia|echeveria|sedum/.test(taxon))
    return {
      interval: 14,
      light: "Яскраве розсіяне світло",
      notes: "Дай ґрунту повністю просохнути між поливами.",
    };
  if (/orchidaceae|phalaenopsis/.test(taxon))
    return {
      interval: 7,
      light: "Яскраве розсіяне світло",
      notes:
        "Перевір корені й субстрат: поливай, коли вони підсохли. Не залишай воду в розетці.",
    };
  if (/nephrolepis|asplenium|adiantum|polypodiaceae/.test(taxon))
    return {
      interval: 4,
      light: "Півтінь",
      notes: "Тримай ґрунт злегка вологим, але без застою води.",
    };
  if (/sansevieria|dracaena|zamioculcas/.test(taxon))
    return {
      interval: 14,
      light: "Яскраве розсіяне світло",
      notes: "Поливай після просихання більшої частини ґрунту.",
    };
  if (/monstera|epipremnum|philodendron|araceae/.test(taxon))
    return {
      interval: 7,
      light: "Яскраве розсіяне світло",
      notes: "Перевір верхні 2–3 см ґрунту; поливай, коли вони сухі.",
    };
  return {
    interval: 7,
    light: "",
    notes:
      "Орієнтовний термін перевірки. Поливай за станом ґрунту; уточни догляд для цього виду.",
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { headers: cors });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: cors });
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer "))
    return new Response("Unauthorized", { status: 401, headers: cors });
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    },
  );
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user)
    return new Response("Unauthorized", { status: 401, headers: cors });
  const membership = await client.rpc("current_couple");
  if (membership.error || !membership.data)
    return new Response("Forbidden", { status: 403, headers: cors });
  const budget = await client.rpc("consume_link_import");
  if (budget.error || !budget.data)
    return new Response("Too many requests", { status: 429, headers: cors });
  const key = Deno.env.get("PLANTNET_API_KEY");
  if (!key)
    return new Response("Recognition unavailable", {
      status: 503,
      headers: cors,
    });
  try {
    const body = await request.formData();
    const images = body.getAll("images");
    if (
      !images.length ||
      images.length > 5 ||
      images.some(
        (image) =>
          !(image instanceof File) ||
          !["image/jpeg", "image/png", "image/webp"].includes(image.type) ||
          image.size > 8 * 1024 * 1024,
      ) ||
      images.reduce((sum, image) => sum + (image as File).size, 0) >
        20 * 1024 * 1024
    )
      return new Response("Invalid image", { status: 400, headers: cors });
    const outbound = new FormData();
    for (const image of images as File[]) {
      outbound.append(
        "images",
        image,
        "plant" +
          (image.type === "image/png"
            ? ".png"
            : image.type === "image/webp"
              ? ".webp"
              : ".jpg"),
      );
      outbound.append("organs", "auto");
    }
    const response = await fetch(
      `https://my-api.plantnet.org/v2/identify/all?api-key=${encodeURIComponent(key)}&lang=uk`,
      {
        method: "POST",
        body: outbound,
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      return new Response("Recognition failed", {
        status: response.status === 429 ? 429 : 502,
        headers: cors,
      });
    const payload = await response.json();
    const best: PlantNetResult | undefined = payload.results?.[0];
    if (!best?.species || (best.score ?? 0) < 0.12)
      return Response.json({ recognized: false }, { headers: cors });
    const scientificName = String(
      best.species.scientificNameWithoutAuthor ||
        best.species.scientificName ||
        "",
    ).slice(0, 120);
    const commonName = best.species.commonNames?.find((name) =>
      /[А-Яа-яІіЇїЄєҐґ]/.test(name),
    );
    return Response.json(
      {
        recognized: true,
        name: String(commonName || scientificName).slice(0, 100),
        species: scientificName,
        confidence: best.score,
        ...careFor(best),
        info_url: `https://uk.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(scientificName)}`,
      },
      { headers: cors },
    );
  } catch {
    return new Response("Recognition failed", { status: 502, headers: cors });
  }
});
