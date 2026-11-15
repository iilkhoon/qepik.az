// Demonstration product pages (app/shop/sample.tsx) and the category each one belongs to.
// They are noindex and kept out of the sitemap.
export const SAMPLE_PAGES: Record<string, string> = {
  testmehsul: "telefon",
  testsoyuducu: "ev",
  testkombi: "ev",
  testpaltaryuyan: "ev",
  testqabyuyan: "ev",
};
export const isSamplePage = (page: string) => Object.hasOwn(SAMPLE_PAGES, page);
