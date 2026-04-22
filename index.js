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

// 📍 DISTANCE FUNCTION
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

// 🚨 MAIN ALERT API
app.post("/send-alert", async (req, res) => {
  try {
    const request = req.body;

    console.log("🔥 New request:", request);

    const usersSnapshot = await db.collection("users").get();

    let sent = 0;

    for (const doc of usersSnapshot.docs) {
      const user = doc.data();

      // ❌ skip invalid users
      if (!user.fcmToken) continue;
      if (!user.lat || !user.lng) continue;

      // 🩸 blood match
      if (user.bloodGroup !== request.bloodGroup) continue;

      // 📍 distance check
      const distance = getDistance(
        user.lat,
        user.lng,
        request.lat,
        request.lng
      );

      if (distance > 20) continue;

      console.log(
        `📤 Sending to ${doc.id} (${distance.toFixed(2)} km)`
      );

      // 🔔 SEND NOTIFICATION
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
          bloodGroup: request.bloodGroup,
          location: request.location,
          phone: request.phone || "9999999999", // 📞 PASS PHONE
        },
      });

      sent++;
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

// 🔥 RENDER PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on ${PORT}`)
);