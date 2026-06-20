import { redirect } from "next/navigation";

/** The brand kit now lives inside the Library. Keep /brand working for old links. */
export default function BrandRedirect() {
  redirect("/library/brand");
}
