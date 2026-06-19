const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'contacts.json');

app.post('/api/contact', (req, res) => {
  if (req.body.phone && !/^\d+$/.test(req.body.phone)) {
    return res.status(400).json({ success: false, message: 'Phone number must contain only digits' });
  }

  const newEntry = {
    ...req.body,
    id: Date.now(),
    submittedAt: new Date().toISOString()
  };

  let contacts = [];
  if (fs.existsSync(DATA_FILE)) {
    const fileData = fs.readFileSync(DATA_FILE, 'utf8');
    contacts = JSON.parse(fileData || '[]');
  }

  contacts.push(newEntry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(contacts, null, 2));

  console.log('New contact saved to contacts.json');
  res.status(200).json({ success: true });
});

const PORT = 5001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));