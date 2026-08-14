const KEY = "estoque_app_v1";

export const loadItems = () => {
  try {
    const data = localStorage.getItem(KEY);
    if (!data) return [];

    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("load error:", e);
    return [];
  }
};

export const saveItems = (items) => {
  try {
    if (!Array.isArray(items)) return;
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch (e) {
    console.error("save error:", e);
  }
};