import { API_PREFIX } from "@devhub/contracts";

import { PRODUCT_NAME } from "@/lib/product";

export default function Home(): React.JSX.Element {
  return (
    <main>
      <section>
        <p>Monorepo foundation</p>
        <h1>{PRODUCT_NAME}</h1>
        <p>
          The dashboard shell is ready. Product capabilities arrive through
          reviewed pull requests, with the API rooted at{" "}
          <code>{API_PREFIX}</code>.
        </p>
      </section>
    </main>
  );
}
