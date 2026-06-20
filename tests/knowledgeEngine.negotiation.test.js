jest.mock("../src/supabaseClient", () => ({
  from: jest.fn(),
}));

const supabase = require("../src/supabaseClient");
const KnowledgeEngine = require("../src/knowledgeEngine");

function mockProductsResult(products) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ data: products, error: null }),
  };
  supabase.from.mockReturnValue(chain);
}

describe("KnowledgeEngine negotiation and alternatives", () => {
  const products = [
    {
      product_id: "jacket_001",
      name: "Windbreaker Jacket",
      price_cents: 249900,
      material: "Polyester Blend",
      sizes: ["M", "L", "XL"],
      colors: ["Black", "Red"],
      tenant_id: "urbanwear",
    },
    {
      product_id: "hoodie_001",
      name: "Classic Hoodie",
      price_cents: 199900,
      material: "Cotton",
      sizes: ["S", "M", "L", "XL"],
      colors: ["Black", "Grey"],
      tenant_id: "urbanwear",
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockProductsResult(products);
  });

  test("returns alternatives when user asks for other products", async () => {
    const session = {
      tenant_id: "urbanwear",
      last_product: "jacket_001",
      last_product_name: "Windbreaker Jacket",
      rejected_products: [],
      rejected_product_names: [],
      browsing_declined_count: 0,
    };

    const result = await KnowledgeEngine.handleProductQuery(
      "some other products",
      session,
      "urbanwear",
    );

    expect(result.type).toBe("ALTERNATIVE_PRODUCTS");
    expect(result.products.some((p) => p.name === "Classic Hoodie")).toBe(true);
    expect(session.last_product).toBeNull();
  });

  test("creates negotiation offer with capped discount", async () => {
    const session = {
      tenant_id: "urbanwear",
      last_product: "jacket_001",
      last_product_name: "Windbreaker Jacket",
      rejected_products: [],
      rejected_product_names: [],
      browsing_declined_count: 0,
    };

    const result = await KnowledgeEngine.handleProductQuery(
      "can you give discount 2000 for this jacket",
      session,
      "urbanwear",
    );

    expect(result.type).toBe("NEGOTIATION_OFFER");
    expect(result.data.name).toBe("Windbreaker Jacket");
    // Max discount 10% from 2499 => 2249.1, rounded
    expect(result.data.offered_price).toBeGreaterThanOrEqual(2249);
    expect(session.negotiated_product_id).toBe("jacket_001");
    expect(session.negotiated_price_cents).toBeGreaterThanOrEqual(224900);
  });
});
