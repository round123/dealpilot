import type { Contact } from "../../types";

const firstCharacter = (value: string | null | undefined) =>
  Array.from(value?.trim() ?? "")[0]?.toLocaleUpperCase() ?? "";

const getInitials = (record: Partial<Contact>) => {
  const firstName = firstCharacter(record.first_name);
  const lastName = firstCharacter(record.last_name);
  const nameInitials = `${firstName}${lastName}`;
  if (nameInitials) return nameInitials;

  const emailLocalPart = record.email_jsonb
    ?.find(({ email }) => email.trim())
    ?.email.split("@", 1)[0];
  return firstCharacter(emailLocalPart);
};

const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character] ?? character,
  );

const createInitialsAvatar = (initials: string) => {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">',
    '<rect width="96" height="96" rx="8" fill="#e5e7eb"/>',
    '<text x="48" y="50" dominant-baseline="middle" text-anchor="middle" ',
    'font-family="Arial, sans-serif" font-size="34" font-weight="600" fill="#374151">',
    escapeXml(initials),
    "</text></svg>",
  ].join("");

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export async function getContactAvatar(
  record: Partial<Contact>,
): Promise<string | null> {
  const storedAvatar = record.avatar?.src?.trim();
  if (storedAvatar) return storedAvatar;

  const initials = getInitials(record);
  return initials ? createInitialsAvatar(initials) : null;
}
