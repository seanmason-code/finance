// ===== CSV Import (Kiwibank + ANZ) =====
const CSVImport = (() => {
  const KIWIBANK_OWN = ['38-9020', '38-9018'];
  const ANZ_OWN = ['01-0902'];

  const EXP_CATS = [
    'Housing', 'Mortgage', 'Rates', 'Food & Dining',
    'Transport', 'Transport: Fuel', 'Transport: Parking & Tolls', 'Transport: Car Maintenance',
    'Health', 'Insurance', 'Entertainment', 'Subscriptions',
    'Shopping', 'Utilities', 'Kids', 'Travel',
    'Savings', 'Investments', 'Work Expenses',
    'Education', 'Personal Care', 'Personal Spending', 'Transfer', 'Other'
  ];
  const INC_CATS = ['Salary', 'Freelance', 'Rental Income', 'Investment', 'Gift', 'Reimbursements', 'Other Income', 'Transfer'];

  // ===== CSV parsing =====

  function parseCSV(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const header = parseCSVLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      if (cells.length < 2) continue;
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

  function detectFormat(rows) {
    if (!rows.length) return 'unknown';
    const keys = Object.keys(rows[0]);
    if (keys.includes('Transaction Code')) return 'kiwibank';
    if (keys.includes('Type') && keys.includes('Details')) return 'anz';
    return 'unknown';
  }

  // ===== Kiwibank =====

  function isInternalKiwibank(row) {
    const other = (row['Other Party Account Number'] || '').trim();
    return other.length > 0 && KIWIBANK_OWN.some(p => other.startsWith(p));
  }

  function buildDescKiwibank(row) {
    const txCode = (row['Transaction Code'] || '').trim();
    const desc = (row['Description'] || '').trim();
    const other = (row['Other Party Name'] || '').trim();

    if (txCode === 'EFTPOS PURCHASE') {
      return desc.replace(/\s*[-–]\s*\d{2}:\d{2}$/, '')
                 .replace(/^POS W\/D\s+/i, '')
                 .trim();
    }
    if ((txCode === 'DIRECT CREDIT' || txCode === 'DIRECT DEBIT') && other) return other;
    if (txCode === 'INTEREST CREDIT') return 'Interest Credit';
    if (txCode === 'IRD WITHHOLDING TAX') return 'IRD Withholding Tax';
    if ((txCode === 'CREDIT TRANSFER' || txCode === 'DEBIT TRANSFER') && other) return other;
    return desc;
  }

  function processKiwibank(rawRows, skipInternal) {
    return rawRows
      .filter(row => !skipInternal || !isInternalKiwibank(row))
      .map(row => {
        const amount = parseFloat(row['Amount']) || 0;
        const type = amount >= 0 ? 'income' : 'expense';
        const desc = buildDescKiwibank(row);
        const date = (row['Transaction Date'] || row['Effective Date'] || '').slice(0, 10);
        const category = autoCategory(desc, row['Transaction Code'] || '', amount);
        const balance = row['Balance'] !== undefined ? parseFloat(row['Balance']) : null;
        return {
          date, description: desc, amount: Math.abs(amount), type, category,
          account: row['Account number'] || '',
          _balance: balance,
          _internal: isInternalKiwibank(row),
        };
      })
      .filter(r => r.date && r.amount > 0);
  }

  // ===== ANZ =====

  function parseANZDate(s) {
    // DD/MM/YYYY → YYYY-MM-DD
    const parts = s.split('/');
    if (parts.length !== 3) return s;
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }

  function isInternalANZ(row) {
    const details = (row['Details'] || '').trim();
    const type = (row['Type'] || '').trim();
    // Transfer to/from another ANZ account
    if (type === 'Transfer' && /^\d{2}-\d{4}/.test(details)) return true;
    // Bill payment to own joint account by name
    if (/J L Schafer.*S Mason|S Mason.*J L Schafer/i.test(details) && type === 'Bill Payment') return true;
    return false;
  }

  function buildDescANZ(row) {
    const type = (row['Type'] || '').trim();
    const details = (row['Details'] || '').trim();
    const particulars = (row['Particulars'] || '').trim();
    const code = (row['Code'] || '').trim();

    // "Direct Debit To" is a useless description — use Particulars or Code
    if (details === 'Direct Debit To') {
      if (particulars && !/^\d{2}-\d{4}/.test(particulars)) return particulars;
      if (code && code !== 'Transfer') return code;
      return 'Direct Debit';
    }

    // Add Particulars for extra context when it's meaningful
    if (particulars && particulars !== 'Debit' && particulars !== 'Credit' && particulars !== 'Transfer') {
      return `${details} - ${particulars}`;
    }
    return details;
  }

  const PERSONAL_SPENDING_ACCOUNTS = ['38-9020-0211287-10', '38-9020-0211287-11'];

  function processANZ(rawRows, skipInternal, filename) {
    const accountFromFile = (filename || '').match(/(\d{2}-\d{4}-\d{7}-\d{2})/)?.[1] || 'ANZ';
    const isPersonalAccount = PERSONAL_SPENDING_ACCOUNTS.includes(accountFromFile);
    return rawRows
      .filter(row => !skipInternal || !isInternalANZ(row))
      .map(row => {
        const amount = parseFloat(row['Amount']) || 0;
        const type = amount >= 0 ? 'income' : 'expense';
        const desc = buildDescANZ(row);
        const date = parseANZDate(row['Date'] || '');
        const category = isPersonalAccount && amount < 0
          ? 'Personal Spending'
          : autoCategory(desc, row['Type'] || '', amount);
        const balance = row['Balance'] !== undefined ? parseFloat(row['Balance']) : null;
        return {
          date, description: desc, amount: Math.abs(amount), type, category,
          account: accountFromFile,
          _balance: balance,
          _internal: isInternalANZ(row),
        };
      })
      .filter(r => r.date && r.date.match(/^\d{4}-\d{2}-\d{2}$/) && r.amount > 0);
  }

  // ===== Auto-categorisation (shared) =====

  function autoCategory(desc, txType, amount) {
    const d = desc.toUpperCase();

    if (amount >= 0) {
      if (/WAGES|SALARY|PAYROLL/.test(d)) return 'Salary';
      if (/INTEREST/.test(d)) return 'Investment';
      if (/RENT|RENTAL|ANEMAX/.test(d)) return 'Rental Income';
      if (/UNIMED|UNI.MED|REIMBURSE|REIMBURSEMENT|SOUTHERN CROSS/.test(d)) return 'Reimbursements';
      if (/HOLIDAY.*PAYOUT|PAYOUT.*HOLIDAY/.test(d)) return 'Other Income';
      if (txType === 'DIRECT CREDIT' || txType === 'Direct Credit') return 'Salary';
      return 'Other Income';
    }

    // Groceries / supermarkets
    if (/PAK.?N.?SAVE|COUNTDOWN|WOOLWORTH|NEW WORLD|FRESH CHOICE|FOUR SQUARE|SUPERETTE|VEGETA/.test(d)) return 'Food & Dining';
    // Cafes, restaurants, takeaways, food delivery, alcohol
    if (/CAFE|COFFEE|LUNCHBAR|SUSHI|RESTAURANT|PIZZA|BURGER|BAKERY|TAKEAWAY|KFC|MCDONALD|SUBWAY|DOMINO|NOODLE|CHICKEN|CHIP.?SHOP|UBER.*EAT|UBEREATS|DOORDASH|MENULOG|DELIVEREASY|BISTRO|EATERY|DINER|GRILL/.test(d)) return 'Food & Dining';
    if (/\bBAR\b/.test(d)) return 'Food & Dining';
    if (/LIQUORLAND|SUPER LIQUOR|BWS|GLENGARRY|BOTTLE.?O\b|NZWINE/.test(d)) return 'Food & Dining';
    // Transport subcategories
    if (/\bBP\b|BP 2GO|\bZ \b|Z ENERGY|\bMOBIL\b|GULL|CALTEX|WAITOMO|PETROL|FUEL/.test(d)) return 'Transport: Fuel';
    if (/PARK(M?ATE|ING|\s)|WILSON P|AT HOP|AUCKLAND TRANSPORT|AKLD TRANSPORT|FERRY|TRAIN|BUS TICKET/.test(d)) return 'Transport: Parking & Tolls';
    if (/\bUBER\b/.test(d) && !/EAT/.test(d)) return 'Transport: Parking & Tolls';
    if (/WOF|WARRANT|TYRE|TIRE|MECHANIC|AUTO.*SERVICE|VEHICLE.*SERVICE|SERVICE.*VEHICLE|CAR.*REPAIR|REPAIR.*CAR|OIL.*CHANGE|AA \b|AA AUTO|BRIDGESTONE|FIRESTONE/.test(d)) return 'Transport: Car Maintenance';
    // Housing
    if (/MORTGAGE|RATES|BODY CORP/.test(d)) return 'Housing';
    // Utilities
    if (/POWER|ELECTRICITY|CONTACT ENERGY|MERIDIAN|GENESIS|VECTOR|WATER SUPPLY|BROADBAND|INTERNET/.test(d)) return 'Utilities';
    if (/\bSPARK\b|VODAFONE|2DEGREES|ONE NZ|ORCON|SKINNY|SLINGSHOT|KIWIBANK.*BILLS|BILLS.*KIWIBANK/.test(d)) return 'Utilities';
    // Insurance (before Health to catch health insurers like Southern Cross)
    if (/\bTOWER\b|VERO|STATE INS|AMI INS|\bAMI\b|AA INS|AA INSURANCE|NIB |PARTNERS LIFE|CIGNA|FIDELITY LIFE|ASTERON|PINNACLE LIFE/.test(d)) return 'Insurance';
    // Health
    if (/PHARMACY|CHEMIST|DOCTOR|MEDICAL|HEALTH|DENTAL|OPTOM|VISION|HOSPITAL|PHYSIO|CLINIC|SOUTHERN CROSS|AIA |SNAP FIT|FLEX FIT|GYM|FITNESS|TRAINING PEAK|SPORTS LAB/.test(d)) return 'Health';
    // Entertainment (streaming)
    if (/NETFLIX|SPOTIFY|DISNEY|AMAZON PRIME|PRIME VIDEO|STEAM|CINEMA|MOVIES|THEATRE|CONCERT|SKY TV|NEON/.test(d)) return 'Entertainment';
    // Subscriptions (non-entertainment software/services)
    if (/\bAPPLE\.COM\b|APPLE\.COM\/BILL|ICLOUD|APPLE STORAGE/.test(d)) return 'Subscriptions';
    if (/GOOGLE.*STORAGE|GOOGLE ONE|GOOGLE.*PLAY|YOUTUBE PREMIUM/.test(d)) return 'Subscriptions';
    if (/ADOBE|MICROSOFT|OFFICE 365|DROPBOX|CANVA|1PASSWORD|LASTPASS|ZOOM|ATLASSIAN|GITHUB/.test(d)) return 'Subscriptions';
    // Travel & accommodation
    if (/AIR NEW ZEALAND|AIR NZ|AIRNZ|JETSTAR|QANTAS|VIRGIN AUST/.test(d)) return 'Travel';
    if (/AIRBNB|BOOKING\.COM|EXPEDIA|WOTIF|TRIVAGO|\bHOTEL\b|\bMOTEL\b|ACCOMMODATION|HOSTEL/.test(d)) return 'Travel';
    // Shopping (online + physical retail)
    if (/WAREHOUSE|KMART|FARMERS|MITRE|BUNNINGS|TRADEME/.test(d)) return 'Shopping';
    if (/\bAMAZON\b|MIGHTY APE|THE ICONIC|ALIEXPRESS|\bEBAY\b/.test(d)) return 'Shopping';
    // Investments (outgoing — KiwiSaver top-ups, share platforms)
    if (/SIMPLICITY|SHARESIES|INVESTNOW|KERNEL|SMARTSHARES|KIWISAVER|TERM DEPOSIT|KIWIWEALTH/.test(d)) return 'Investments';
    // Savings transfers
    if (/SAVINGS TRANSFER|TRANSFER.*SAVING|SAVING.*TRANSFER/.test(d)) return 'Savings';
    // Kids (incl. childcare & daycare)
    if (/SWIMMING|SWIM LESSON|REMUERA|KINDO|SCHOOL FEE|UNIFORM|SKIDS|APPLES|GAMEDAYNZ/.test(d)) return 'Kids';
    if (/CHILDCARE|DAYCARE|CRECHE|KINDY|KINDERGARTEN|KOHANGA|EARLY CHILDHOOD|EDUCARE|ECE /.test(d)) return 'Kids';
    // Education
    if (/SCHOOL|UNIVERSIT|COURSE|STATIONERY|WHITCO/.test(d)) return 'Education';
    // Work expenses
    if (/OFFICEMAX|OFFICE MAX|OFFICEWORKS|STAPLES|WORK EXPENSE/.test(d)) return 'Work Expenses';
    // Personal Care
    if (/HAIR|BEAUTY|NAIL|SALON|MASSAGE|SPA/.test(d)) return 'Personal Care';

    return 'Other';
  }

  // ===== Public API =====

  function processRows(rawRows, skipInternal, filename) {
    const format = detectFormat(rawRows);
    if (format === 'kiwibank') return processKiwibank(rawRows, skipInternal);
    if (format === 'anz') return processANZ(rawRows, skipInternal, filename);
    return [];
  }

  function categoryOptionsHTML(selected, type) {
    const cats = type === 'income' ? INC_CATS : EXP_CATS;
    return cats.map(c =>
      `<option value="${c}"${c === selected ? ' selected' : ''}>${c}</option>`
    ).join('');
  }

  // Returns {account_number: closing_balance} from the last transaction per account
  function getLastBalances(rows) {
    const byAccount = {};
    rows.forEach(row => {
      if (row.account && row._balance != null && !isNaN(row._balance)) {
        if (!byAccount[row.account] || row.date >= byAccount[row.account].date) {
          byAccount[row.account] = { date: row.date, balance: row._balance };
        }
      }
    });
    const result = {};
    Object.entries(byAccount).forEach(([acc, data]) => { result[acc] = data.balance; });
    return result;
  }

  return { parseCSV, processRows, categoryOptionsHTML, getLastBalances, PERSONAL_SPENDING_ACCOUNTS };
})();
