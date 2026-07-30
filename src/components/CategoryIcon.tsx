import { useCategories } from "../data/categories";

type Props = {
  value?: string;
  label?: boolean;
  className?: string;
};

export function CategoryIcon({ value = "", label = false, className = "" }: Props) {
  const categories = useCategories();
  const parts = value.split("/").map((part) => part.trim()).filter(Boolean);
  const parentName = parts[0] || value || "Other";
  const subName = parts.length > 1 ? parts.at(-1) : undefined;
  const parent = categories.find((category) => category.name === parentName)
    ?? categories.find((category) => category.subcategories?.some((sub) => sub.name === parentName || sub.name === subName))
    ?? categories.find((category) => category.name === "Other");
  const subcategory = parent?.subcategories?.find((sub) => sub.name === subName || sub.name === parentName);
  const item = subcategory ?? parent;
  const name = subcategory?.name ?? parent?.name ?? parentName;
  const image = item?.image;
  const icon = item?.icon || "📌";
  const classes = ["category-icon", image ? "has-image" : "", className].filter(Boolean).join(" ");

  const avatar = (
    <span className={classes} title={name} aria-label={`${name} category`}>
      {image ? <img src={image} alt="" aria-hidden="true" /> : icon}
    </span>
  );

  if (!label) return avatar;

  return (
    <span className="category-label">
      {avatar}
      <span>{value || name}</span>
    </span>
  );
}
