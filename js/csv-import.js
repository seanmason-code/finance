// ===== CSV Import (Kiwibank) =====
const CSVImport = (() => {
  const OWN_PREFIXES = ['38-9020', '38-9018'];

  const EXP_CATS = [
    'Housing', 'Food & Dining', 'Transport', 'Health',
    'Entertainment', 'Shopping', 'Utilities', 'Education',
    'Personal Care', 'Other'
  ];
  const INC_CATS = ['Salary', 'Freelance', 'Investment', 'Gift', 'Other Income'];

  function parseCSV(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const header = parseCSVLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      if (cells.length < 14) continue;
      const obj = {};
      header.forEach((h, idx) => { obj[h.trim()] = (cells[idx] || '').trim(); });
      rows.push(obj);
    }
    return rows;
  }

  function parseCSVLine(line) {
    const result = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur);
    return result;
  }

  function isInternal(row) {
    const other = (row['Other Party Account Number'] || '').trim();
    return other.length > 0 && OWN_PREFIXES.some(p => other.startsWith(p));
  }

  function buildDescription(row) {
    const txCode = (row['Transaction Code'] || '').trim();
    const desc = (row['Description'] || '').trim();
    const other = (row['Other Party Name'] || '').trim();

    if (txCode === 'EFTPOS PURCHASE') {
      // Remove trailing timestamp like "-09:36" or "- 12:31"
      return desc.replace(/\s*[-–]\s*\d{2}:\d{2}$/, '')
                 .replace(/^POS W\/D\s+/i, '')
                 .trim();
    }
    if ((txCode === 'DIRECT CREDIT' || txCode === 'DIRECT DEBIT') && other) {
      return other;
    }
    if (txCode === 'INTEREST CREDIT') return 'Interest Credit';
    if (txCode === 'IRD WITHHOLDING TAX') return 'IRD Withholding Tax';
    if (txCode === 'CREDIT TRANSFER' && other) return other;
    if (txCode === 'DEBIT TRANSFER' && other) return other;
    return desc;
  }

  function autoCategory(desc, txCode, amount) {
    const d = desc.toUpperCase();

    if (amount >= 0) {
      if (/WAGES|SALARY|PAYROLL/.test(d)) return 'Salary';
      if (/INTEREST/.test(d)) return 'Investment';
      if (/RENT|RENTAL/.test(d)) return 'Other Income';
      if (txCode === 'DIRECT CREDIT') return 'Salary';
      return 'Other Income';
    }

    // Groceries / supermarkets
    if (/PAK.?N.?SAVE|COUNTDOWN|WOOLWORTH|NEW WORLD|FRESH CHOICE|FOUR SQUARE|SUPERETTE|VEGETA/.test(d)) return 'Food & Dining';
    // Cafes, restaurants, takeaways
    if (/CAFE|COFFEE|LUNCHBAR|SUSHI|RESTAURANT|PIZZA|BURGER|BAKERY|TAKEAWAY|KFC|MCDONALD|SUBWAY|DOMINO|NOODLE|CHICKEN|CHIP.?SHOP|UBER.*EAT|UBEREATS|BISTRO|EATERY|DINER|GRILL|LUNCH|DINNER|BRUNCH/.test(d)) return 'Food & Dining';
    if (/\bBAR\b/.test(d) && !/SIDEBAR|TOOLBAR/.test(d)) return 'Food & Dining';
    // Transport
    if (/\bBP\b|BP 2GO|\bZ \b|Z ENERGY|\bMOBIL\b|GULL|CALTEX|WAITOMO|PETROL|FUEL/.test(d)) return 'Transport';
    if (/PARK(M?ATE|ING|\s)|WILSON P|AT HOP|AUCKLAND TRANSPORT|AKLD TRANSPORT|FERRY|TRAIN|BUS TICKET/.test(d)) return 'Transport';
    if (/\bUBER\b/.test(d) && !/EAT/.test(d)) return 'Transport';
    // Mortgage / Housing
    if (/MORTGAGE|RENT\b/.test(d)) return 'Housing';
    // Utilities
    if (/POWER|ELECTRICITY|CONTACT ENERGY|MERIDIAN|GENESIS|VECTOR|WATER SUPPLY|BROADBAND|INTERNET/.test(d)) return 'Utilities';
    if (/\bSPARK\b|VODAFONE|2DEGREES|ONE NZ|ORCON|SKINNY|SLINGSHOT/.test(d)) return 'Utilities';
    // Health
    if (/PHARMACY|CHEMIST|DOCTOR|MEDICAL|HEALTH|DENTAL|OPTOM|VISION|HOSPITAL|PHYSIO|CLINIC/.test(d)) return 'Health';
    // Entertainment
    if (/NETFLIX|SPOTIFY|DISNEY|AMAZON PRIME|PRIME VIDEO|GAMING|STEAM|CINEMA|MOVIES|THEATRE|CONCERT|SKY TV|NEON/.test(d)) return 'Entertainment';
    // Shopping
    if (/WAREHOUSE|KMART|FARMERS|MITRE|BUNNINGS|TRADEME/.test(d)) return 'Shopping';
    // Education
    if (/SCHOOL|UNIVERSIT|COURSE|STATIONERY|WHITCO/.test(d)) return 'Education';
    // Personal Care
    if (/HAIR|BEAUTY|NAIL|GYM|FITNESS|SALON|MASSAGE|SPA/.test(d)) return 'Personal Care';

    return 'Other';
  }

  function processRows(rawRows, skipInternal) {
    return rawRows
      .filter(row => !skipInternal || !isInternal(row))
      .map(row => {
        const amount = parseFloat(row['Amount']) || 0;
        const absAmount = Math.abs(amount);
        const type = amount >= 0 ? 'income' : 'expense';
        const desc = buildDescription(row);
        const date = (row['Transaction Date'] || row['Effective Date'] || '').slice(0, 10);
        const txCode = row['Transaction Code'] || '';
        const category = autoCategory(desc, txCode, amount);
        return {
          date,
          description: desc,
          amount: absAmount,
          type,
          category,
          account: row['Account number'] || '',
          _internal: isInternal(row),
          _selected: true,
        };
      })
      .filter(r => r.date && r.amount > 0);
  }

  function categoryOptionsHTML(selected, type) {
    const cats = type === 'income' ? INC_CATS : EXP_CATS;
    return cats.map(c =>
      `<option value="${c}"${c === selected ? ' selected' : ''}>${c}</option>`
    ).join('');
  }

  return { parseCSV, processRows, categoryOptionsHTML };
})();
