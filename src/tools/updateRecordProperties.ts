import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Tool, ToolSchema } from "@modelcontextprotocol/sdk/types.js";
import { executeJxa } from "../applescript/execute.js";
import {
  escapeStringForJXA,
  isJXASafeString,
} from "../utils/escapeString.js";
import { getRecordLookupHelpers } from "../utils/jxaHelpers.js";

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

const UpdateRecordPropertiesSchema = z
  .object({
    uuid: z.string().describe("The UUID of the record to update"),
    url: z.string().optional().describe("The URL for the record"),
    country: z.string().optional().describe("Country for the record"),
    comment: z.string().optional().describe("Comment for the record"),
    rating: z.number().min(0).max(5).optional().describe("Rating (0-5)"),
    label: z.number().min(0).max(7).optional().describe("Label index (0-7)"),
    flag: z.boolean().optional().describe("Flag state"),
    name: z.string().optional().describe("Record name"),
  })
  .strict();

type UpdateRecordPropertiesInput = z.infer<typeof UpdateRecordPropertiesSchema>;

interface UpdateRecordPropertiesResult {
  success: boolean;
  error?: string;
  uuid?: string;
  name?: string;
  updatedProperties?: string[];
  skippedProperties?: string[];
}

const updateRecordProperties = async (
  input: UpdateRecordPropertiesInput
): Promise<UpdateRecordPropertiesResult> => {
  const { uuid, url, country, comment, rating, label, flag, name } = input;

  // Validate string inputs
  if (!isJXASafeString(uuid)) {
    return { success: false, error: "UUID contains invalid characters" };
  }

  const script = `
    (() => {
      const theApp = Application("DEVONthink");
      theApp.includeStandardAdditions = true;
      
      // Inject helper functions
      ${getRecordLookupHelpers()}
      
      try {
        // Use the unified lookup function
        const lookupOptions = {};
        lookupOptions["uuid"] = ${uuid ? `"${escapeStringForJXA(uuid)}"` : "null"};
        
        const lookupResult = getRecord(theApp, lookupOptions);
        
        if (!lookupResult.record) {
          const errorResponse = {};
          errorResponse["success"] = false;
          errorResponse["error"] = "Record with UUID " + (${uuid ? `"${escapeStringForJXA(uuid)}"` : "null"} || "unknown") + " not found";
          return JSON.stringify(errorResponse);
        }
        
        const record = lookupResult.record;
        const updatedProperties = [];
        const skippedProperties = [];
        
        // Update properties if provided
        ${url ? `
        try {
          record.url = "${escapeStringForJXA(url)}";
          updatedProperties.push("url");
        } catch (error) {
          console.log("Warning: Failed to set url: " + error.toString());
          skippedProperties.push("url");
        }
        ` : ""}
        
        ${country ? `
        try {
          record.country = "${escapeStringForJXA(country)}";
          updatedProperties.push("country");
        } catch (error) {
          console.log("Warning: Failed to set country: " + error.toString());
          skippedProperties.push("country");
        }
        ` : ""}
        
        ${comment !== undefined ? `
        try {
          record.comment = "${escapeStringForJXA(comment || "")}";
          updatedProperties.push("comment");
        } catch (error) {
          console.log("Warning: Failed to set comment: " + error.toString());
          skippedProperties.push("comment");
        }
        ` : ""}
        
        ${rating !== undefined ? `
        try {
          record.rating = ${rating};
          updatedProperties.push("rating");
        } catch (error) {
          console.log("Warning: Failed to set rating: " + error.toString());
          skippedProperties.push("rating");
        }
        ` : ""}
        
        ${label !== undefined ? `
        try {
          record.label = ${label};
          updatedProperties.push("label");
        } catch (error) {
          console.log("Warning: Failed to set label: " + error.toString());
          skippedProperties.push("label");
        }
        ` : ""}
        
        ${flag !== undefined ? `
        try {
          record.flag = ${flag};
          updatedProperties.push("flag");
        } catch (error) {
          console.log("Warning: Failed to set flag: " + error.toString());
          skippedProperties.push("flag");
        }
        ` : ""}
        
        ${name ? `
        try {
          record.name = "${escapeStringForJXA(name)}";
          updatedProperties.push("name");
        } catch (error) {
          console.log("Warning: Failed to set name: " + error.toString());
          skippedProperties.push("name");
        }
        ` : ""}
        
        // Build success response
        const response = {};
        response["success"] = true;
        response["uuid"] = record.uuid();
        response["name"] = record.name();
        response["updatedProperties"] = updatedProperties;
        response["skippedProperties"] = skippedProperties;
        
        return JSON.stringify(response);
      } catch (error) {
        const errorResponse = {};
        errorResponse["success"] = false;
        errorResponse["error"] = error.toString();
        return JSON.stringify(errorResponse);
      }
    })();
  `;

  return await executeJxa<UpdateRecordPropertiesResult>(script);
};

export const updateRecordPropertiesTool: Tool = {
  name: "update_record_properties",
  description: "Updates standard record properties in DEVONthink like URL, comment, rating, label, flag, and name. These are built-in DEVONthink properties, not custom metadata. Since UUIDs are globally unique across all databases, only the UUID is required to identify the record.",
  inputSchema: zodToJsonSchema(UpdateRecordPropertiesSchema) as ToolInput,
  run: updateRecordProperties,
};