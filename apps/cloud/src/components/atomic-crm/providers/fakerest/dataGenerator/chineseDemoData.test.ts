import generateData from "./index";

describe("Chinese demo data", () => {
  it("uses Chinese business content for every primary local resource", () => {
    const db = generateData();
    const containsChinese = (value: string | null | undefined) =>
      expect(value).toMatch(/[\u3400-\u9fff]/);

    db.companies.forEach((company) => containsChinese(company.name));
    db.deals.forEach((deal) => containsChinese(deal.name));
    db.follow_ups.forEach((followUp) => containsChinese(followUp.note));
    db.deal_risks.forEach((risk) => containsChinese(risk.description));
    db.deal_milestones.forEach((milestone) => containsChinese(milestone.name));
  });
});
