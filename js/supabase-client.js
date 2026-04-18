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
    const PAGE = 1000;
    let all = [], from = 0;
    while (true) {
      const { data, error } = await client
        .from('transactions')
        .select('*')
        .order('date', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      all = all.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }

  async function upsertTransaction(t) {
    const { error } = await client.from('transactions').upsert(t);
    if (error) throw error;
  }

  async function batchUpsertTransactions(rows, chunkSize = 200) {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await client.from('transactions').upsert(chunk);
      if (error) throw error;
    }
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

  // ===== Accounts =====
  async function getAccounts() {
    const { data, error } = await client.from('accounts').select('*').order('name');
    if (error) throw error;
    return data;
  }

  async function upsertAccount(a) {
    const { error } = await client.from('accounts').upsert(a);
    if (error) throw error;
  }

  async function deleteAccount(id) {
    const { error } = await client.from('accounts').delete().eq('id', id);
    if (error) throw error;
  }

  // ===== Goals =====
  async function getGoals() {
    const { data, error } = await client.from('goals').select('*').order('created_at');
    if (error) throw error;
    return data;
  }

  async function upsertGoal(g) {
    const { error } = await client.from('goals').upsert(g);
    if (error) throw error;
  }

  async function deleteGoal(id) {
    const { error } = await client.from('goals').delete().eq('id', id);
    if (error) throw error;
  }

  return {
    init, get,
    signIn, signUp, signOut, getSession,
    getTransactions, upsertTransaction, batchUpsertTransactions, deleteTransaction,
    getBudgets, upsertBudget, deleteBudget,
    getRecurring, upsertRecurring, deleteRecurring,
    getAccounts, upsertAccount, deleteAccount,
    getGoals, upsertGoal, deleteGoal,
  };
})();
