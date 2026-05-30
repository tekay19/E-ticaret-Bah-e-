import {
  CustomerEngagementRepository,
  CustomerRepository,
  ProductRepository,
} from "@bahce-shop/repositories";
import { ForbiddenError, NotFoundError } from "@bahce-shop/shared";

export class CustomerEngagementService {
  private readonly engagement = new CustomerEngagementRepository();
  private readonly customers = new CustomerRepository();
  private readonly products = new ProductRepository();

  async createContactMessage(input: {
    fullName: string;
    email: string;
    phone?: string | null;
    subject?: string | null;
    message: string;
  }) {
    return {
      data: await this.engagement.createContactMessage(input),
    };
  }

  async subscribeNewsletter(email: string) {
    return {
      data: await this.engagement.subscribeNewsletter(email),
    };
  }

  async listReviews(productSlug: string) {
    const product = await this.findProductBySlug(productSlug);
    const [reviews, summary] = await Promise.all([
      this.engagement.listReviews(product.id),
      this.engagement.reviewSummary(product.id),
    ]);

    return {
      data: reviews,
      meta: summary,
    };
  }

  async createReview(userId: string, productSlug: string, input: {
    rating: number;
    title?: string | null;
    comment: string;
  }) {
    const [customer, product] = await Promise.all([
      this.findCustomer(userId),
      this.findProductBySlug(productSlug),
    ]);
    const eligible = await this.engagement.hasPurchasedProduct(customer.id, product.id);
    if (!eligible) {
      throw new ForbiddenError("Bu urune yorum yazmak icin teslim edilmis bir satin alma gerekiyor.");
    }

    return {
      data: await this.engagement.upsertReview({
        productId: product.id,
        customerId: customer.id,
        rating: input.rating,
        title: input.title ?? null,
        comment: input.comment,
      }),
    };
  }

  async listWishlist(userId: string) {
    const customer = await this.findCustomer(userId);
    return {
      data: await this.engagement.listCustomerItems("wishlist_items", customer.id),
    };
  }

  async addWishlist(userId: string, productId: string) {
    const customer = await this.findCustomer(userId);
    await this.ensureProduct(productId);
    return {
      data: await this.engagement.addCustomerItem("wishlist_items", customer.id, productId),
    };
  }

  async removeWishlist(userId: string, productId: string) {
    const customer = await this.findCustomer(userId);
    return this.engagement.removeCustomerItem("wishlist_items", customer.id, productId);
  }

  async listCompare(userId: string) {
    const customer = await this.findCustomer(userId);
    return {
      data: await this.engagement.listCustomerItems("compare_items", customer.id),
    };
  }

  async addCompare(userId: string, productId: string) {
    const customer = await this.findCustomer(userId);
    await this.ensureProduct(productId);
    return {
      data: await this.engagement.addCustomerItem("compare_items", customer.id, productId),
    };
  }

  async removeCompare(userId: string, productId: string) {
    const customer = await this.findCustomer(userId);
    return this.engagement.removeCustomerItem("compare_items", customer.id, productId);
  }

  private async findCustomer(userId: string) {
    const customer = await this.customers.findByUserId(userId);
    if (!customer) {
      throw new NotFoundError("Musteri kaydi bulunamadi.");
    }

    return customer;
  }

  private async findProductBySlug(slug: string) {
    const product = await this.products.findBySlug(slug);
    if (!product || !product.isActive) {
      throw new NotFoundError("Urun bulunamadi.");
    }

    return product;
  }

  private async ensureProduct(productId: string) {
    const product = await this.products.findById(productId);
    if (!product || !product.isActive) {
      throw new NotFoundError("Urun bulunamadi.");
    }
  }
}
