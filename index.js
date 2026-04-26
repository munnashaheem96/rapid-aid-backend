const express = require("express");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🔥 FIREBASE INIT
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// 📍 DISTANCE FUNCTION (HAVERSINE)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// 🚨 MAIN ALERT API
app.post("/send-alert", async (req, res) => {
  try {
    const request = req.body;

    console.log("🔥 New request:", request);

    // 🔥 VALIDATION
    if (!request.lat || !request.lng || !request.bloodGroup) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const usersSnapshot = await db.collection("users").get();

    let sent = 0;

    // 🔥 EXPANDING RADIUS
    const radiusLevels = [20, 30, 40, 50];

    // 🔥 PREVENT DUPLICATES
    const notifiedUsers = new Set();

    for (let radius of radiusLevels) {
      console.log(`🔍 Searching within ${radius} km`);

      for (const doc of usersSnapshot.docs) {
        const user = doc.data();

        // ❌ skip invalid users
        if (!user.fcmToken) continue;
        if (!user.lat || !user.lng) continue;

        // ❌ skip already notified
        if (notifiedUsers.has(doc.id)) continue;

        // 🩸 blood match
        if (user.bloodGroup !== request.bloodGroup) continue;

        // 📍 distance
        const distance = getDistance(
          user.lat,
          user.lng,
          request.lat,
          request.lng
        );

        if (distance > radius) continue;

        console.log(
          `📤 Sending to ${doc.id} (${distance.toFixed(2)} km)`
        );

        try {
          await admin.messaging().send({
            token: user.fcmToken,

            notification: {
              title: "🚨 Emergency Blood Request",
              body: `${request.bloodGroup} needed near ${request.location}`,
            },

            android: {
              priority: "high",
              notification: {
                sound: "default",
                channelId: "emergency_channel",
                clickAction: "FLUTTER_NOTIFICATION_CLICK",
              },
            },

            data: {
              bloodGroup: request.bloodGroup || "Unknown",
              location: request.location || "Nearby",
              phone: request.phone || "9999999999",
            },
          });

          notifiedUsers.add(doc.id);
          sent++;
        } catch (err) {
          console.error(`❌ Failed for ${doc.id}:`, err.message);
        }
      }

      // 🔥 STOP if we found users
      if (sent > 0) {
        console.log(`✅ Found users within ${radius} km`);
        break;
      }
    }

    console.log(`✅ Total notifications sent: ${sent}`);

    res.json({ success: true, sent });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).send("Error sending alerts");
  }
});

// 🌐 ROOT CHECK
app.get("/", (req, res) => {
  res.send("🚀 Rapid Aid Backend Running");
});

// 🔥 PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on ${PORT}`)
);