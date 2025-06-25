import { type NextRequest, NextResponse } from "next/server";
import { permit } from "@/lib/permit";
import { v4 as uuidv4 } from "uuid";
import {
  getMeetingFromGlobalRegistry,
  saveMeetingToGlobalRegistry,
  createApprovalRequest,
} from "@/lib/meeting-storage";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meetingId, email, firstName, lastName, approvalId } = body;

    console.log("Join request:", {
      meetingId,
      email,
      firstName,
      lastName,
      approvalId,
    });

    // Check if meeting exists in our registry first
    let meeting = getMeetingFromGlobalRegistry(meetingId);
    console.log("Meeting from registry:", meeting);

    // If not found in registry, try to get it from Permit.io resource instances
    if (!meeting) {
      console.log("Meeting not found in registry, checking Permit.io...");
      try {
        // Check if the resource instance exists in Permit.io
        const resourceInstance = await permit.api.resourceInstances.get(
          `web-rtc:${meetingId}`
        );
        console.log("Found resource instance in Permit.io:", resourceInstance);

        // Extract meeting data from Permit.io attributes
        const attributes =
          (resourceInstance.attributes as {
            pendingApprovals?: string;
            title?: string;
            description?: string;
            accessType?: string;
            allowedEmails?: string;
            createdAt?: string;
            createdBy?: string;
            creatorEmail?: string;
            creatorSessionId?: string;
            creatorUserId?: string;
            isActive?: boolean;
          }) || {};

        // Parse existing pending approvals if they exist
        let existingPendingApprovals = [];
        try {
          if (attributes.pendingApprovals) {
            existingPendingApprovals = JSON.parse(attributes.pendingApprovals);
          }
        } catch (parseError) {
          console.log(
            "Could not parse existing pending approvals:",
            parseError
          );
        }

        meeting = {
          id: meetingId,
          title: attributes.title || `Meeting ${meetingId}`,
          description: attributes.description || "",
          accessType:
            (attributes.accessType as "open" | "approval" | "email") || "open",
          allowedEmails: attributes.allowedEmails || "",
          createdAt: attributes.createdAt || new Date().toISOString(),
          createdBy: attributes.createdBy || "unknown",
          creatorSessionId: "unknown",
          creatorUserId: attributes.createdBy || "unknown",
          creatorEmail: attributes.creatorEmail || "unknown@example.com",
          participants: [],
          pendingApprovals: existingPendingApprovals,
          isActive: attributes.isActive !== false,
        };

        console.log("Reconstructed meeting from Permit.io:", meeting);

        // Save it to our registry for future use
        try {
          saveMeetingToGlobalRegistry(meeting);
          console.log("Saved meeting to registry from Permit.io data");
        } catch (saveError) {
          console.log("Could not save to registry (server-side):", saveError);
        }
      } catch (permitError) {
        console.error("Resource instance not found in Permit.io:", permitError);
        return NextResponse.json(
          { success: false, error: "Meeting not found" },
          { status: 404 }
        );
      }
    }

    if (!meeting) {
      return NextResponse.json(
        { success: false, error: "Meeting not found" },
        { status: 404 }
      );
    }

    // Check access control based on meeting type
    console.log(
      "Checking access control for meeting type:",
      meeting.accessType
    );

    if (meeting.accessType === "email") {
      // Check if email is in allowed list
      const allowedEmails = meeting.allowedEmails
        .split("\n")
        .map((e) => e.trim().toLowerCase());
      if (!allowedEmails.includes(email.toLowerCase())) {
        return NextResponse.json(
          {
            success: false,
            error: "Your email is not authorized to join this meeting",
          },
          { status: 403 }
        );
      }
    } else if (meeting.accessType === "approval") {
      // For approval meetings, check if this is an approved request
      if (!approvalId) {
        // This is an initial join request - create approval request using server-side function
        console.log("Creating approval request for:", {
          email,
          firstName,
          lastName,
        });

        try {
          const { approvalId: newApprovalId, updatedMeeting } =
            createApprovalRequest(
              meeting,
              `${firstName} ${lastName}`,
              email,
              `server-session-${Date.now()}`
            );

          console.log("Created approval request with ID:", newApprovalId);

          // Update the meeting in Permit.io attributes to persist the approval request
          try {
            const currentAttributes =
              (await permit.api.resourceInstances.get(`web-rtc:${meetingId}`))
                .attributes || {};
            await permit.api.resourceInstances.update(`web-rtc:${meetingId}`, {
              attributes: {
                ...currentAttributes,
                pendingApprovals: JSON.stringify(
                  updatedMeeting.pendingApprovals
                ),
                lastUpdated: new Date().toISOString(),
              },
            });
            console.log(
              "Updated meeting in Permit.io with new approval request"
            );
          } catch (updateError) {
            console.error(
              "Failed to update meeting in Permit.io:",
              updateError
            );
          }

          return NextResponse.json({
            success: false,
            requiresApproval: true,
            approvalId: newApprovalId,
            message:
              "Your request to join has been sent to the meeting host for approval",
          });
        } catch (approvalError) {
          console.error("Error creating approval request:", approvalError);
          return NextResponse.json({
            success: false,
            requiresApproval: true,
            approvalId: `temp-${Date.now()}`,
            message:
              "Your request to join has been sent to the meeting host for approval",
          });
        }
      } else {
        // This is a response to an approval - check if it was approved
        console.log("Checking approval status for approvalId:", approvalId);

        // Check if the approval ID exists in the meeting's pending approvals
        let hasPendingApproval = false;

        // Try to get updated meeting data from Permit.io
        try {
          const resourceInstance = await permit.api.resourceInstances.get(
            `web-rtc:${meetingId}`
          );
          const attributes =
            (resourceInstance.attributes as { pendingApprovals?: string }) ||
            {};
          if (attributes.pendingApprovals) {
            const pendingApprovals = JSON.parse(attributes.pendingApprovals);
            hasPendingApproval = pendingApprovals.some(
              (a: any) => a.id === approvalId
            );
            console.log("Pending approvals from Permit.io:", pendingApprovals);
            console.log(
              "Has pending approval for",
              approvalId,
              ":",
              hasPendingApproval
            );
          }
        } catch (error) {
          console.error("Error checking approval status:", error);
        }

        if (hasPendingApproval) {
          // Still pending - not approved yet
          return NextResponse.json({
            success: false,
            requiresApproval: true,
            approvalId,
            message:
              "Your request is still pending approval from the meeting host",
          });
        }

        // If not in pending list, assume it was approved
        console.log("Approval not found in pending list - assuming approved");
      }
    }

    // Generate user ID
    let userId = uuidv4();

    // Check if user already exists in Permit
    let user;
    try {
      // Try to find user by email first
      const users = await permit.api.users.list();
      user = users.data.find((u: any) => u.email === email);

      if (!user) {
        // Create new user
        console.log("Creating new user in Permit");
        user = await permit.api.syncUser({
          key: userId,
          email: email,
          first_name: firstName,
          last_name: lastName,
          role_assignments: [
            {
              role: `viewer`,
              tenant: "default",
            },
          ],
        });
      } else {
        console.log("User already exists:", user);
        // Use existing user ID
        userId = user.key;
      }
    } catch (error) {
      console.error("Error managing user:", error);
      return NextResponse.json(
        { success: false, error: "Failed to manage user" },
        { status: 500 }
      );
    }

    // Check if user already has a role assignment for this meeting
    let existingRoles: any[] = [];
    console.log("this is meeting id   🔥🔥🔥🔥🔥🔥", meetingId, user);

    try {
      const roleAssignments = await permit.api.roleAssignments.list({
        user: user.key,
        tenant: "default",
        resource_instance: `web-rtc:${meetingId}`,
      });
      // existingRoles = roleAssignments;
      existingRoles = roleAssignments.filter(role => 
        role.resource_instance === meetingId
      )
      console.log("Existing role assignments for user:", existingRoles);
    } catch (error) {
      console.log("No existing role assignments found:", error);
    }

    // Determine the user's role for this meeting
    let userRole = "participant";

    if (existingRoles.length > 0) {
      // User already has a role assigned
      userRole = existingRoles[0].role;
      console.log("User already has role:", userRole);
    } else {
      // Check if this user is the meeting creator
      if (
        user.key === meeting.createdBy ||
        user.key === meeting.creatorUserId
      ) {
        userRole = "admin";
        console.log("User is meeting creator, assigning admin role");
      } else {
        userRole = "participant";
        console.log("User is new participant, assigning participant role");
      }

      // Assign the appropriate role to the meeting resource instance
      try {
        await permit.api.roleAssignments.assign({
          user: user.key,
          role: userRole,
          tenant: "default",
          resource_instance: `web-rtc:${meetingId}`,
        });
        console.log(
          `Successfully assigned ${userRole} role to user ${user.key}`
        );
      } catch (roleError) {
        console.error("Error assigning role:", roleError);
        // Continue anyway - we'll use the default participant role
      }
    }

    // Get updated user's roles for this meeting
    const userRoles = await permit.api.roleAssignments.list({
      user: user.key,
      tenant: "default",
      resource_instance: `web-rtc:${meetingId}`,
    });

    console.log("Final user roles for meeting:", userRoles);
    console.log("Join successful:", {
      userId: user.key,
      userRole,
      userRoles: userRoles,
    });

    return NextResponse.json({
      success: true,
      userId: user.key,
      userRole, // Include the determined role
      userRoles: userRoles,
      meeting,
    });
  } catch (error) {
    console.error("Error joining meeting:", error);
    return NextResponse.json(
      { success: false, error: "Failed to join meeting" },
      { status: 500 }
    );
  }
}
