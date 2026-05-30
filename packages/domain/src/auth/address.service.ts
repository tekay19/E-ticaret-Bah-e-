import { NotFoundError } from "@bahce-shop/shared";
import {
  AddressRepository,
  CustomerRepository,
  type CreateAddressInput,
  type UpdateAddressInput,
} from "@bahce-shop/repositories";

export class AddressService {
  private readonly customers = new CustomerRepository();
  private readonly addresses = new AddressRepository();

  async listForUser(userId: string) {
    const customer = await this.customers.findByUserId(userId);
    if (!customer) {
      throw new NotFoundError("Musteri kaydi bulunamadi.");
    }

    return this.addresses.listByCustomerId(customer.id);
  }

  async createForUser(userId: string, input: Omit<CreateAddressInput, "customerId">) {
    const customer = await this.customers.findByUserId(userId);
    if (!customer) {
      throw new NotFoundError("Musteri kaydi bulunamadi.");
    }

    return this.addresses.create({
      ...input,
      customerId: customer.id,
    });
  }

  async updateForUser(userId: string, addressId: string, input: UpdateAddressInput) {
    const customer = await this.customers.findByUserId(userId);
    if (!customer) {
      throw new NotFoundError("Musteri kaydi bulunamadi.");
    }

    const address = await this.addresses.findById(addressId);
    if (!address || address.customerId !== customer.id) {
      throw new NotFoundError("Adres bulunamadi.");
    }

    const updated = await this.addresses.update(addressId, input);
    if (!updated) {
      throw new NotFoundError("Adres guncellenemedi.");
    }

    return updated;
  }

  async deleteForUser(userId: string, addressId: string) {
    const customer = await this.customers.findByUserId(userId);
    if (!customer) {
      throw new NotFoundError("Musteri kaydi bulunamadi.");
    }

    const address = await this.addresses.findById(addressId);
    if (!address || address.customerId !== customer.id) {
      throw new NotFoundError("Adres bulunamadi.");
    }

    await this.addresses.deleteById(addressId);
    return { success: true };
  }
}
