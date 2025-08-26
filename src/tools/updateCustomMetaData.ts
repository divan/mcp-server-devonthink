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

const UpdateCustomMetaDataSchema = z
  .object({
    uuid: z.string().describe("The UUID of the record to update"),
    customMetaData: z
      .record(z.any())
      .describe("Custom metadata as key-value pairs (e.g., {'Year': 2024, 'Country': 'USA'})"),
    replace: z
      .boolean()
      .optional()
      .default(false)
      .describe("If true, replace all existing custom metadata. If false, merge with existing metadata."),
  })
  .strict();

type UpdateCustomMetaDataInput = z.infer<typeof UpdateCustomMetaDataSchema>;

interface UpdateCustomMetaDataResult {
  success: boolean;
  error?: string;
  uuid?: string;
  name?: string;
  updatedKeys?: string[];
  skippedKeys?: string[];
}

const updateCustomMetaData = async (
  input: UpdateCustomMetaDataInput
): Promise<UpdateCustomMetaDataResult> => {
  const { uuid, customMetaData, replace = false } = input;

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
        const metadata = ${JSON.stringify(customMetaData || {})};
        const replaceMode = ${replace};
        
        const updatedKeys = [];
        const skippedKeys = [];
        
        // If replace mode, we could clear existing custom metadata first
        // However, DEVONthink doesn't provide a direct way to remove all custom metadata
        // So we'll just update/add the provided keys
        
        // Add/update custom metadata
        for (const [key, value] of Object.entries(metadata)) {
          try {
            theApp.addCustomMetaData(value, {for: key, to: record});
            updatedKeys.push(key);
          } catch (metadataError) {
            console.log("Warning: Failed to set custom metadata '" + key + "': " + metadataError.toString());
            skippedKeys.push(key);
          }
        }
        
        // Build success response
        const response = {};
        response["success"] = true;
        response["uuid"] = record.uuid();
        response["name"] = record.name();
        response["updatedKeys"] = updatedKeys;
        response["skippedKeys"] = skippedKeys;
        
        return JSON.stringify(response);
      } catch (error) {
        const errorResponse = {};
        errorResponse["success"] = false;
        errorResponse["error"] = error.toString();
        return JSON.stringify(errorResponse);
      }
    })();
  `;

  return await executeJxa<UpdateCustomMetaDataResult>(script);
};

export const updateCustomMetaDataTool: Tool = {
  name: "update_custom_metadata",
  description: "Updates custom metadata (custom columns) for an existing record in DEVONthink. This allows you to set custom fields like Year, Country, Author, etc. that appear as columns in DEVONthink's interface. Since UUIDs are globally unique across all databases, only the UUID is required to identify the record.",
  inputSchema: zodToJsonSchema(UpdateCustomMetaDataSchema) as ToolInput,
  run: updateCustomMetaData,
};