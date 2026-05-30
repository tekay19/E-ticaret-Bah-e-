import { ReportRepository } from "@bahce-shop/repositories";

type ReportRange = {
  from?: string;
  to?: string;
  limit?: number;
};

export class ReportService {
  private readonly reports = new ReportRepository();

  async overview(range: ReportRange) {
    return {
      range: this.responseRange(range),
      data: await this.reports.overview(range),
    };
  }

  async sales(range: ReportRange) {
    const normalized = this.queryRange(range);
    return {
      range: this.responseRange(range),
      data: {
        series: await this.reports.sales(normalized),
        topProducts: await this.reports.topProducts(normalized, range.limit ?? 10),
      },
    };
  }

  async inventory(range: ReportRange) {
    return {
      range: this.responseRange(range),
      data: await this.reports.inventoryRisk(range.limit ?? 50),
    };
  }

  async coupons(range: ReportRange) {
    const normalized = this.queryRange(range);
    return {
      range: this.responseRange(range),
      data: await this.reports.couponPerformance(normalized, range.limit ?? 50),
    };
  }

  private queryRange(range: ReportRange) {
    return {
      from: range.from,
      to: range.to,
    };
  }

  private responseRange(range: ReportRange) {
    return {
      from: range.from ?? null,
      to: range.to ?? null,
    };
  }
}
