// ===== Supabase Client =====
const SB = (() => {
  let client = null;

  function init(url, anonKey) {
    client = supabase.createClient(url, anonKey);
    return client;
  }

  function get() {
    return client;
  }

  // ===== Auth =====
  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signUp(email, password) {
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    await client.auth.signOut();
  }

  async function getSession() {
    const { data } = await client.auth.getSession();
    return data.session;
  }

  // ===== Transactions =====
  async function getTransactions() {
    const { data, error } = await client
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async function upsertTransaction(t) {
    const { error } = await client.from('transactions').upsert(t);
    if (error) throw error;
  }

  async function deleteTransaction(id) {
    const { error } = await client.from('transactions').delete().eq('id', id);
    if (error) throw error;
  }

  // ===== Budgets =====
  async function getBudgets() {
    const { data, error } = await client.from('budgets').select('*');
    if (error) throw error;
    return data;
  }

  async function upsertBudget(b) {
    const { error } = await client.from('budgets').upsert(b);
    if (error) throw error;
  }

  async function deleteBudget(id) {
    const { error } = await client.from('budgets').delete().eq('id', id);
    if (error) throw error;
  }

  // ===== Recurring =====
  async function getRecurring() {
    const { data, error } = await client.from('recurring').select('*').order('description');
    if (error) throw error;
    return data;
  }

  async function upsertRecurring(r) {
    const { error } = await client.from('recurring').upsert(r);
    if (error) throw error;
  }

  async function deleteRecurring(id) {
    const { error } = await client.from('recurring').delete().eq('id', id);
    if (error) throw error;
  }

  return {
    init, get,
    signIn, signUp, signOut, getSession,
    getTransactions, upsertTransaction, deleteTransaction,
    getBudgets, upsertBudget, deleteBudget,
    getRecurring, upsertRecurring, deleteRecurring,
  };
})();
