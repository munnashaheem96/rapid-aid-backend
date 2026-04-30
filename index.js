// index.js
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 Firebase init (FIREBASE_KEY = JSON string in env)
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/// 📍 HAVERSINE DISTANCE (km)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

app.post("/send-alert", async (req, res) => {
  try {
    const request = req.body;
    console.log("🔥 Incoming request:", request);

    if (!request.lat || !request.lng || !request.bloodGroup) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const usersSnap = await db.collection("users").get();

    const tokens = [];
    const userDocIds = [];

    for (const doc of usersSnap.docs) {
      const u = doc.data();

      const hasToken = !!u.fcmToken;
      const hasLocation = u.lat != null && u.lng != null;
      const bloodMatch = u.bloodGroup === request.bloodGroup;

      if (!hasToken || !hasLocation) continue;
      if (!bloodMatch) continue;

      const distance = getDistance(u.lat, u.lng, request.lat, request.lng);
      if (distance > 50) continue; // 🔧 adjust radius as needed

      tokens.push(u.fcmToken);
      userDocIds.push(doc.id);
    }

    if (tokens.length === 0) {
      console.log("⚠️ No eligible users found");
      return res.json({ success: true, sent: 0 });
    }

    console.log("📤 Sending to tokens:", tokens.length);

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      data: {
        bloodGroup: String(request.bloodGroup),
        location: String(request.location ?? "Nearby"),
        phone: String(request.phone ?? "9999999999"),
      },
      android: { priority: "high" },
    });

    let success = 0;
    const invalidDocIds = [];

    response.responses.forEach((r, idx) => {
      if (r.success) {
        success++;
      } else {
        const code = r.error?.code;
        console.log("❌ Error for token:", code);

        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          invalidDocIds.push(userDocIds[idx]);
        }
      }
    });

    // 🔥 CLEAN INVALID TOKENS
    for (const docId of invalidDocIds) {
      console.log("🧹 Removing invalid token for:", docId);
      await db.collection("users").doc(docId).update({
        fcmToken: admin.firestore.FieldValue.delete(),
      });
    }

    console.log(`✅ Sent: ${success}/${tokens.length}`);

    res.json({ success: true, sent: success });
  } catch (e) {
    console.error("❌ Server error:", e);
    res.status(500).send("Error sending alerts");
  }
});

app.get("/", (_, res) => res.send("🚀 Rapid Aid Backend Running"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("🚀 Server running on", PORT));