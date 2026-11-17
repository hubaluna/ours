import { useState } from "react";
import { LinkImport } from "./LinkImportLoader";
import { WishForm } from "./Forms";
import { MovieForm } from "./MovieForm";
import { RecipeForm } from "./RecipeForm";
import { useApp } from "../hooks/AppContext";
import {
  detectShareTarget,
  type ShareTargetDestination,
} from "../lib/share-target";
import type { LinkMetadata } from "../../supabase/functions/_shared/metadata";
import { movieSynopsis } from "../../supabase/functions/_shared/movie-synopsis";
import type { NewMovie, NewWish, Tab } from "../lib/types";

export function UniversalShareImport({
  url,
  onClose,
  onNavigateTab,
}: {
  url: string;
  onClose: () => void;
  onNavigateTab: (tab: Tab) => void;
}) {
  const { addShoppingBatch } = useApp();
  const [target, setTarget] = useState<ShareTargetDestination>(() =>
    detectShareTarget(url),
  );
  const [subForm, setSubForm] = useState<
    | null
    | { type: "wish"; initial: Partial<NewWish> }
    | { type: "movie"; initial: Partial<NewMovie> }
    | { type: "recipe"; initial: LinkMetadata }
  >(null);

  if (subForm?.type === "wish") {
    return (
      <WishForm
        initial={subForm.initial}
        onClose={() => {
          onNavigateTab("wishes");
          onClose();
        }}
      />
    );
  }

  if (subForm?.type === "movie") {
    return (
      <MovieForm
        initial={subForm.initial}
        onClose={() => {
          onNavigateTab("movies");
          onClose();
        }}
      />
    );
  }

  if (subForm?.type === "recipe") {
    return (
      <RecipeForm
        initial={subForm.initial}
        onClose={() => {
          onNavigateTab("menu");
          onClose();
        }}
        onSaved={() => {
          onNavigateTab("menu");
          onClose();
        }}
      />
    );
  }

  const kind =
    target === "movie" ? "movie" : target === "wish" ? "wish" : "recipe";

  return (
    <LinkImport
      initialUrl={url}
      autoLoad={true}
      allowTargetChange={true}
      target={target}
      onTargetChange={setTarget}
      kind={kind}
      onClose={onClose}
      onRecipe={async (items) => {
        const ok = await addShoppingBatch(items);
        if (ok) {
          onNavigateTab("shopping");
          onClose();
        }
        return ok;
      }}
      onResult={(meta) => {
        if (target === "wish") {
          setSubForm({
            type: "wish",
            initial: {
              name: meta.title,
              url: meta.source_url,
              image_url: meta.image_url,
              image_path: null,
              note: meta.description,
              price: meta.currency === "UAH" ? meta.price : null,
              priority: "Просто хочу",
            },
          });
        } else if (target === "movie") {
          setSubForm({
            type: "movie",
            initial: {
              title: meta.title,
              url: meta.source_url,
              poster_url: meta.image_url,
              year: meta.year,
              genres: meta.genres.join(", "),
              description: movieSynopsis(meta.description),
              status: "planned",
              metadata_url: meta.metadata_url ?? "",
            },
          });
        } else if (target === "menu") {
          setSubForm({ type: "recipe", initial: meta });
        }
      }}
    />
  );
}
