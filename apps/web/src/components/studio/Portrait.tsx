import { portraitOf } from "./catalogue";

/** a Furnishes piece's portrait, cut out on nothing: a small static
    WebP under public/catalogue, served as it is */
export function Portrait({
  productId,
  className,
}: {
  productId: string;
  className?: string;
}) {
  const src = portraitOf({ productId });
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={src} alt="" />;
}
