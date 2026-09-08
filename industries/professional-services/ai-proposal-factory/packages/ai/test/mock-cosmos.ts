import type { Container } from "@azure/cosmos";

export function memoryCosmosContainer() {
  const records = new Map<string, Record<string, any>>();
  let version = 0;
  const key = (id: string, partition: string) => `${partition}|${id}`;
  const response = (value: Record<string, any>) => ({ resource: structuredClone(value), etag: value._etag });
  const save = (value: Record<string, any>) => {
    const next: Record<string, any> = structuredClone({ ...value, _etag: `etag-${++version}` });
    records.set(key(next.id, next.partitionKey), next);
    return response(next);
  };
  const container = {
    item: (id: string, partition: string) => ({
      read: async () => {
        const value = records.get(key(id, partition));
        if (!value) throw { code: 404 };
        return response(value);
      },
      replace: async (value: Record<string, any>, options: { accessCondition?: { condition: string } } = {}) => {
        const existing = records.get(key(id, partition));
        if (!existing) throw { code: 404 };
        if (options.accessCondition?.condition !== existing._etag) throw { code: 412 };
        return save(value);
      }
    }),
    items: {
      create: async (value: Record<string, any>) => {
        if (records.has(key(value.id, value.partitionKey))) throw { code: 409 };
        return save(value);
      },
      upsert: async (value: Record<string, any>) => save(value),
      query: (query: { query: string; parameters?: Array<{ name: string; value: any }> }) => ({
        fetchAll: async () => {
          const parameters = Object.fromEntries((query.parameters ?? []).map((item) => [item.name, item.value]));
          let values = [...records.values()];
          if (parameters["@entityType"]) values = values.filter((value) => value.entityType === parameters["@entityType"]);
          if (parameters["@type"]) values = values.filter((value) => value.entityType === parameters["@type"]);
          if (parameters["@id"]) values = values.filter((value) => value.id === parameters["@id"]);
          if (parameters["@opportunityId"]) values = values.filter((value) =>
            value.partitionKey === parameters["@opportunityId"] || value.partitionKey === parameters["@shared"]);
          if (parameters["@kind"]) values = values.filter((value) => value.value?.kind === parameters["@kind"] &&
            value.value.dispatched === false && value.value.terminal === false);
          values.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
          if (query.query.includes("TOP 1 ")) values = values.slice(0, 1);
          return { resources: structuredClone(values) };
        }
      })
    }
  };
  return { container: container as unknown as Container, records };
}
