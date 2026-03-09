import { ConstructionEvent } from "@/lib/constructionNews";

const DEFAULT_IMAGE =
  "https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=1200";

export function getNewsImageUrl(event: ConstructionEvent) {
  if (event.image_url && event.image_url.trim()) {
    return event.image_url.trim();
  }

  const tags = event.tags;

  if (tags.includes("monsoon") || tags.includes("climate")) {
    return "https://images.pexels.com/photos/125510/pexels-photo-125510.jpeg?auto=compress&cs=tinysrgb&w=1200";
  }

  if (tags.includes("labor") || tags.includes("productivity")) {
    return "https://images.pexels.com/photos/3825581/pexels-photo-3825581.jpeg?auto=compress&cs=tinysrgb&w=1200";
  }

  if (tags.includes("logistics") || tags.includes("cost")) {
    return "https://images.pexels.com/photos/585419/pexels-photo-585419.jpeg?auto=compress&cs=tinysrgb&w=1200";
  }

  if (tags.includes("compliance") || tags.includes("governance") || tags.includes("regulatory")) {
    return "https://images.pexels.com/photos/4386370/pexels-photo-4386370.jpeg?auto=compress&cs=tinysrgb&w=1200";
  }

  if (tags.includes("sustainability")) {
    return "https://images.pexels.com/photos/414837/pexels-photo-414837.jpeg?auto=compress&cs=tinysrgb&w=1200";
  }

  if (tags.includes("roads") || tags.includes("bridges") || tags.includes("airports") || tags.includes("metro")) {
    return "https://images.pexels.com/photos/159306/construction-site-build-construction-work-159306.jpeg?auto=compress&cs=tinysrgb&w=1200";
  }

  return DEFAULT_IMAGE;
}
