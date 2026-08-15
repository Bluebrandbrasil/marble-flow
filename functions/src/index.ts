import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { DateTime } from "luxon";

admin.initializeApp();

const db = getFirestore(admin.app(), "marbleflow");

/**
 * Trigger: On user profile document creation/update
 * Path: users/{uid}
 * Database: marbleflow
 * 
 * Purpose: Automatically sync Firestore role/companyId/status to Firebase Auth Custom Claims
 */
export const syncUserClaims = onDocumentWritten({
    document: "users/{uid}",
    database: "marbleflow"
}, async (event) => {
    const uid = event.params.uid;
    const data = event.data?.after?.exists ? event.data.after.data() : null;

    if (!data) {
        // User profile deleted, clear claims
        try {
            await admin.auth().setCustomUserClaims(uid, null);
            console.log(`Cleared claims for deleted user ${uid}`);
        } catch (error) {
            console.error(`Error clearing claims for deleted user ${uid}:`, error);
        }
        return;
    }

    const role = data.role || "vendedor";
    const companyId = data.companyId || "";
    const status = data.status || "pending";
    const superadmin = role === "superadmin" || data.isSuperAdmin === true;

    try {
        await admin.auth().setCustomUserClaims(uid, {
            role,
            companyId,
            status,
            superadmin
        });
        console.log(`Successfully synced claims for user ${uid}:`, {
            role,
            companyId,
            status,
            superadmin
        });
    } catch (error) {
        console.error(`Error setting claims for user ${uid}:`, error);
    }
});

/**
 * Scheduled Function: Run every 5 minutes
 * Purpose: Check for upcoming measurements (1h, 30m, 10m) and send Web Push notifications to assigned medidores
 */
export const checkUpcomingMeasurements = onSchedule({
    schedule: "every 5 minutes",
    timeZone: "America/Sao_Paulo",
    region: "us-central1"
}, async (event) => {
    const nowSP = DateTime.now().setZone("America/Sao_Paulo");
    const todayStr = nowSP.toFormat("yyyy-MM-dd");
    const tomorrowStr = nowSP.plus({ days: 1 }).toFormat("yyyy-MM-dd");

    console.log(`Running checkUpcomingMeasurements at ${nowSP.toString()} for dates: ${todayStr}, ${tomorrowStr}`);

    try {
        const snapshot = await db.collection("medicoes")
            .where("status", "in", ["scheduled", "reagendada"])
            .where("scheduledDate", "in", [todayStr, tomorrowStr])
            .get();

        if (snapshot.empty) {
            console.log("No scheduled or rescheduled measurements found for today or tomorrow.");
            return;
        }

        console.log(`Found ${snapshot.size} candidate measurements to check.`);

        for (const docSnap of snapshot.docs) {
            const measurement = docSnap.data();
            const assignedStaffId = measurement.assignedStaffId;
            if (!assignedStaffId) {
                continue;
            }

            const scheduledDate = measurement.scheduledDate;
            const scheduledTime = measurement.scheduledTime || "00:00";
            const scheduledStr = `${scheduledDate}T${scheduledTime}`;
            const scheduledDT = DateTime.fromISO(scheduledStr, { zone: "America/Sao_Paulo" });

            if (!scheduledDT.isValid) {
                console.error(`Invalid scheduled timestamp for document ${docSnap.id}: ${scheduledStr}`);
                continue;
            }

            const diffMinutes = scheduledDT.diff(nowSP, "minutes").minutes;

            // Only notify for future measurements or very recently started/about to start (e.g. diffMinutes > -5)
            if (diffMinutes <= -5) {
                continue;
            }

            let threshold: "1h" | "30m" | "10m" | null = null;

            if (diffMinutes <= 10 && !measurement.notified10m) {
                threshold = "10m";
            } else if (diffMinutes <= 30 && !measurement.notified30m) {
                threshold = "30m";
            } else if (diffMinutes <= 60 && !measurement.notified1h) {
                threshold = "1h";
            }

            if (!threshold) {
                continue;
            }

            console.log(`Measurement ${docSnap.id} is in ${diffMinutes.toFixed(1)} minutes. Triggering ${threshold} alert.`);

            // Verify if the assigned staff member is indeed a medidor (measurer) and active/approved
            const userDocSnap = await db.collection("users").doc(assignedStaffId).get();
            if (!userDocSnap.exists) {
                console.warn(`Assigned staff user ${assignedStaffId} does not exist in Firestore.`);
                continue;
            }

            const userData = userDocSnap.data();
            const userRole = userData?.role;
            const userStatus = userData?.status;

            if (userRole !== "medidor") {
                console.log(`Skipping notification for user ${assignedStaffId} because role is ${userRole} (not "medidor").`);
                // Mark flags to avoid repeatedly checking this non-medidor measurement
                const updateData: Record<string, any> = {};
                if (threshold === "10m") {
                    updateData.notified10m = true;
                    updateData.notified30m = true;
                    updateData.notified1h = true;
                } else if (threshold === "30m") {
                    updateData.notified30m = true;
                    updateData.notified1h = true;
                } else if (threshold === "1h") {
                    updateData.notified1h = true;
                }
                await docSnap.ref.update(updateData);
                continue;
            }

            if (userStatus !== "approved") {
                console.log(`Skipping notification for user ${assignedStaffId} because status is ${userStatus} (not "approved").`);
                continue;
            }

            // Fetch tokens for this user
            const tokensSnapshot = await db.collection("users")
                .doc(assignedStaffId)
                .collection("notificationTokens")
                .where("active", "==", true)
                .get();

            if (tokensSnapshot.empty) {
                console.log(`No active notification tokens found for medidor ${assignedStaffId}.`);
                // Update notified flags to prevent infinite loops
                const updateData: Record<string, any> = {};
                if (threshold === "10m") {
                    updateData.notified10m = true;
                    updateData.notified30m = true;
                    updateData.notified1h = true;
                } else if (threshold === "30m") {
                    updateData.notified30m = true;
                    updateData.notified1h = true;
                } else if (threshold === "1h") {
                    updateData.notified1h = true;
                }
                await docSnap.ref.update(updateData);
                continue;
            }

            const tokens: string[] = [];
            const tokenDocRefs: admin.firestore.DocumentReference[] = [];
            tokensSnapshot.forEach(tokenDoc => {
                const data = tokenDoc.data();
                if (data.token) {
                    tokens.push(data.token);
                    tokenDocRefs.push(tokenDoc.ref);
                }
            });

            if (tokens.length === 0) {
                continue;
            }

            // Notification content
            let titleText = "Você tem uma medição em breve";
            if (threshold === "1h") {
                titleText = "Medição em 1 hora";
            } else if (threshold === "30m") {
                titleText = "Medição em 30 minutos";
            } else if (threshold === "10m") {
                titleText = "Medição em 10 minutos";
            }

            const clientName = measurement.customerName || "Cliente não informado";
            const timeText = measurement.scheduledTime || "--:--";
            const addressText = measurement.address || "Endereço não informado";
            const bodyText = `Medição com ${clientName} às ${timeText} em ${addressText}`;

            console.log(`Sending push notification to ${tokens.length} tokens for user ${assignedStaffId}`);

            const response = await admin.messaging().sendEachForMulticast({
                tokens,
                notification: {
                    title: titleText,
                    body: bodyText
                },
                data: {
                    clientName,
                    scheduledTime: timeText,
                    address: addressText,
                    googleMapsUrl: measurement.address 
                        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(measurement.address)}` 
                        : ""
                }
            });

            // Clean up invalid/expired tokens
            for (let i = 0; i < response.responses.length; i++) {
                const res = response.responses[i];
                if (!res.success) {
                    const errorCode = res.error?.code;
                    console.error(`FCM failed for token index ${i} (error code: ${errorCode}):`, res.error);
                    if (
                        errorCode === "messaging/invalid-registration-token" ||
                        errorCode === "messaging/registration-token-not-registered"
                    ) {
                        try {
                            await tokenDocRefs[i].delete();
                            console.log(`Deleted invalid token document: ${tokenDocRefs[i].path}`);
                        } catch (deleteErr) {
                            console.error(`Failed to delete token document ${tokenDocRefs[i].path}:`, deleteErr);
                        }
                    }
                }
            }

            // Update flags in Firestore
            const updateData: Record<string, any> = {};
            if (threshold === "10m") {
                updateData.notified10m = true;
                updateData.notified30m = true;
                updateData.notified1h = true;
            } else if (threshold === "30m") {
                updateData.notified30m = true;
                updateData.notified1h = true;
            } else if (threshold === "1h") {
                updateData.notified1h = true;
            }

            await docSnap.ref.update(updateData);
            console.log(`Successfully updated notified flags for measurement ${docSnap.id}`);
        }
    } catch (error) {
        console.error("Error running checkUpcomingMeasurements:", error);
    }
});

/**
 * Callable Function: Save Manager Signature
 * Purpose: Securely validates a single-use token and saves manager signature on server-side.
 */
export const saveManagerSignature = onCall({
    region: "us-central1"
}, async (request) => {
    const { token, signatureData } = request.data || {};
    if (!token || !signatureData) {
        throw new HttpsError("invalid-argument", "Token e dados da assinatura são obrigatórios.");
    }

    // Validate signature data URL format (only png allowed) and limit size
    if (typeof signatureData !== "string" || !signatureData.startsWith("data:image/png;base64,")) {
        throw new HttpsError("invalid-argument", "Formato de assinatura inválido. Deve ser uma imagem PNG em base64.");
    }
    if (signatureData.length > 2 * 1024 * 1024) {
        throw new HttpsError("invalid-argument", "Os dados da assinatura excedem o limite de tamanho permitido (2MB).");
    }


    const tokenRef = db.collection("manager_signature_tokens").doc(token);
    const tokenSnap = await tokenRef.get();

    if (!tokenSnap.exists) {
        throw new HttpsError("not-found", "Token de assinatura não encontrado.");
    }

    const tokenData = tokenSnap.data();
    if (!tokenData) {
        throw new HttpsError("internal", "Erro ao carregar dados do token.");
    }

    const { active, usedAt, expiresAt, companyId } = tokenData;

    if (active !== true || usedAt) {
        throw new HttpsError("failed-precondition", "Este link de assinatura já foi utilizado ou está inativo.");
    }

    if (expiresAt) {
        const expiresTime = new Date(expiresAt).getTime();
        const nowTime = Date.now();
        if (nowTime > expiresTime) {
            throw new HttpsError("failed-precondition", "Este link de assinatura expirou (limite de 10 minutos).");
        }
    }

    try {
        await db.runTransaction(async (transaction) => {
            const companyRef = db.collection("companies").doc(companyId);
            const companySnap = await transaction.get(companyRef);
            if (!companySnap.exists) {
                throw new Error("Empresa associada ao token não existe.");
            }

            const currentCompanyData = companySnap.data() || {};
            const settings = currentCompanyData.settings || {};

            // Update company
            transaction.update(companyRef, {
                companySignature: signatureData,
                settings: {
                    ...settings,
                    signature: signatureData
                },
                managerSignatureUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Invalidate token
            transaction.update(tokenRef, {
                active: false,
                usedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        console.log(`Successfully saved manager signature for company ${companyId} using token ${token}`);
        console.log('[MANAGER_SIGNATURE] assinatura salva');
        return { success: true, message: "Assinatura registrada e salva com sucesso!" };

    } catch (err: any) {
        console.error("Error saving signature in transaction:", err);
        throw new HttpsError("internal", err.message || "Erro interno ao salvar assinatura.");
    }
});

/**
 * Callable Function: Change User Password
 * Purpose: Securely updates another user's password in Firebase Auth.
 * Permissions: Only users with custom claims role 'company_admin', 'admin', or superadmin = true can perform this action,
 * and the target user must belong to the same companyId (unless caller is a superadmin).
 */
export const changeUserPassword = onCall({
    region: "us-central1"
}, async (request) => {
    const { uid: targetUid, newPassword } = request.data || {};

    if (!targetUid || !newPassword) {
        throw new HttpsError("invalid-argument", "UID do colaborador e a nova senha são obrigatórios.");
    }

    if (typeof newPassword !== "string" || newPassword.length < 6) {
        throw new HttpsError("invalid-argument", "A nova senha deve ter no mínimo 6 caracteres.");
    }

    const callerUid = request.auth?.uid;
    const callerRole = request.auth?.token?.role;
    const callerCompanyId = request.auth?.token?.companyId;
    const callerSuperadmin = request.auth?.token?.superadmin;

    if (!callerUid) {
        throw new HttpsError("unauthenticated", "O usuário deve estar autenticado.");
    }

    // Checking if the caller has admin permissions
    const hasAdminAccess = callerRole === "company_admin" || callerRole === "admin" || callerSuperadmin === true;
    if (!hasAdminAccess) {
        throw new HttpsError("permission-denied", "Apenas administradores podem alterar a senha de outros colaboradores.");
    }

    try {
        // Fetch target user from Firestore to verify company compatibility
        const targetDocRef = db.collection("users").doc(targetUid);
        const targetDocSnap = await targetDocRef.get();

        if (!targetDocSnap.exists) {
            throw new HttpsError("not-found", "Colaborador não encontrado no banco de dados.");
        }

        const targetData = targetDocSnap.data();
        
        // If not superadmin, they must belong to the same company
        if (callerSuperadmin !== true && targetData?.companyId !== callerCompanyId) {
            throw new HttpsError("permission-denied", "Você não tem permissão para alterar a senha de um colaborador de outra empresa.");
        }

        // Update password using admin SDK
        await admin.auth().updateUser(targetUid, {
            password: newPassword
        });

        console.log(`[PASSWORD_CHANGE] Admin ${callerUid} successfully updated password for user ${targetUid}`);
        return { success: true, message: "Senha atualizada com sucesso." };
    } catch (error: any) {
        console.error("Error changing password:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", error.message || "Erro interno ao atualizar a senha.");
    }
});

/**
 * Callable Function: Change User Email
 * Purpose: Securely updates another user's email in Firebase Auth and Firestore.
 * Permissions: Only users with custom claims role 'company_admin', 'admin', or superadmin = true can perform this action,
 * and the target user must belong to the same companyId (unless caller is a superadmin).
 */
export const changeUserEmail = onCall({
    region: "us-central1"
}, async (request) => {
    const { uid: targetUid, newEmail } = request.data || {};

    if (!targetUid || !newEmail) {
        throw new HttpsError("invalid-argument", "UID do colaborador e o novo e-mail são obrigatórios.");
    }

    if (typeof newEmail !== "string" || !newEmail.includes("@")) {
        throw new HttpsError("invalid-argument", "Forneça um endereço de e-mail válido.");
    }

    const callerUid = request.auth?.uid;
    const callerRole = request.auth?.token?.role;
    const callerCompanyId = request.auth?.token?.companyId;
    const callerSuperadmin = request.auth?.token?.superadmin;

    if (!callerUid) {
        throw new HttpsError("unauthenticated", "O usuário deve estar autenticado.");
    }

    // Checking if the caller has admin permissions
    const hasAdminAccess = callerRole === "company_admin" || callerRole === "admin" || callerSuperadmin === true;
    if (!hasAdminAccess) {
        throw new HttpsError("permission-denied", "Apenas administradores podem alterar o e-mail de outros colaboradores.");
    }

    try {
        // Fetch target user from Firestore to verify company compatibility
        const targetDocRef = db.collection("users").doc(targetUid);
        const targetDocSnap = await targetDocRef.get();

        if (!targetDocSnap.exists) {
            throw new HttpsError("not-found", "Colaborador não encontrado no banco de dados.");
        }

        const targetData = targetDocSnap.data();
        
        // If not superadmin, they must belong to the same company
        if (callerSuperadmin !== true && targetData?.companyId !== callerCompanyId) {
            throw new HttpsError("permission-denied", "Você não tem permissão para alterar o e-mail de um colaborador de outra empresa.");
        }

        // Update email using admin SDK
        await admin.auth().updateUser(targetUid, {
            email: newEmail
        });

        // Update Firestore document
        await targetDocRef.update({
            email: newEmail,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: callerUid
        });

        console.log(`[EMAIL_CHANGE] Admin ${callerUid} successfully updated email for user ${targetUid} to ${newEmail}`);
        return { success: true, message: "E-mail atualizado com sucesso." };
    } catch (error: any) {
        console.error("Error changing email:", error);
        
        if (error.code === 'auth/email-already-exists') {
            throw new HttpsError("already-exists", "O endereço de e-mail já está sendo usado por outro usuário.");
        }
        
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", error.message || "Erro interno ao atualizar o e-mail.");
    }
});
